import { type GOLogsInsightsResultField, readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { Step } from '../../../../../engine/types/Step.js';
import type { StepKind } from '../../../../../engine/types/StepKind.js';
import type { RunbookContext } from '../../../../../engine/types/RunbookContext.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';
import type { StepCoverage } from '../../../../../engine/types/StepCoverage.js';
import type { StepDiagnostics } from '../../../../../engine/tracing/StepDiagnostics.js';
import { readStepOutput } from '../../../../../engine/context/readStepOutput.js';
import type { TimeRangeFromParams } from '../../../time/TimeRangeFromParams.js';
import { resolveTimeRange } from '../../../time/resolveTimeRange.js';
import { executeStep } from '../../../../../engine/steps/execution/executeStep.js';
import { executeCloudWatchLogsQuery } from '../../../steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
import type { ExecutedCloudWatchLogsQuery } from '../../../steps/aws/cloudwatch-logs/ExecutedCloudWatchLogsQuery.js';
import { mergeCloudWatchLogsDiagnostics } from '../../../steps/aws/cloudwatch-logs/mergeCloudWatchLogsDiagnostics.js';

import { rowMeetsThreshold, sanitizeApiGwField } from '../accessLog/accessLogRow.js';
import { ApiGwReporter } from '../reporting/ApiGwReporter.js';
import type { ExecutionLogSpec } from '../executionLog/ExecutionLogSpec.js';
import type { AccessLogSchema } from '../accessLog/AccessLogSchema.js';
import { renderQueryTemplate } from '../../../queries/renderQueryTemplate.js';
import { OperationalStep } from '../../../steps/OperationalStep.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { OperationalServiceName } from '../../../services/OperationalServiceName.js';

const QUERY_MODE_VAR = 'apiGwExecutionLogMode';
const INCOMPLETE_REQUESTS_VAR = 'apiGwExecutionLogIncompleteRequestIds';

interface RequestIdWithPath {
  readonly path: string;
  readonly requestId: string;
}

/** Leading `(<requestId>)` of an API Gateway execution-log line. */
const EXECUTION_LOG_REQUEST_PREFIX = /^\(([^()\s]+)\)/u;

/** A request id that may enter a predicate: letters, digits and dashes. */
const REQUEST_ID = /^[A-Za-z0-9-]{1,128}$/u;

/**
 * Configuration for {@link QueryApiGwExecutionLogsStep}.
 */
export interface QueryApiGwExecutionLogsConfig {
  /** Unique step identifier. */
  readonly id: string;
  /** Human-readable label. */
  readonly label: string;
  /** Step id of the API Gateway AccessLog query. */
  readonly fromStep: string;
  /** API Gateway execution log group to query when requestIds are found. */
  readonly executionLogGroup?: string;
  /** Minimum HTTP status code to include (default: 500). */
  readonly minStatusCode?: number;
  /** Mapping for the time-range parameters in the runbook context. */
  readonly timeRangeFromParams: TimeRangeFromParams;
  /**
   * Specification dell'execution log (dal profilo del prodotto).
   */
  readonly spec: ExecutionLogSpec;
  /**
   * Schema dell'AccessLog (per leggere i campi `requestId`, `path`,
   * `errorMessage`, `statusFields`, sentinels).
   */
  readonly accessLogSchema: AccessLogSchema;
  /**
   * Identificatore del profilo per i metadati di trace.
   */
  readonly queryProfileId: string;
  /**
   * Request ids per query, in place of `spec.maxRequestIds`: more request ids are read with more queries.
   */
  readonly maxRequestIdsOverride?: number;
}

export class QueryApiGwExecutionLogsStep
  extends OperationalStep<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>>
  implements Step<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>>
{
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly fromStep: string;
  private readonly executionLogGroup: string | undefined;
  private readonly minStatusCode: number;
  private readonly timeRangeFromParams: TimeRangeFromParams;
  private readonly spec: ExecutionLogSpec;
  private readonly accessLogSchema: AccessLogSchema;
  private readonly queryProfileId: string;
  private readonly maxRequestIdsOverride: number | undefined;

  constructor(config: QueryApiGwExecutionLogsConfig) {
    super();
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.executionLogGroup = config.executionLogGroup;
    this.minStatusCode = config.minStatusCode ?? 500;
    this.timeRangeFromParams = config.timeRangeFromParams;
    this.spec = config.spec;
    this.accessLogSchema = config.accessLogSchema;
    this.queryProfileId = config.queryProfileId;
    this.maxRequestIdsOverride = config.maxRequestIdsOverride;
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    const startStr = context.params.get(this.timeRangeFromParams.start);
    const endStr = context.params.get(this.timeRangeFromParams.end);

    return {
      queryProfileId: this.queryProfileId,
      queryKind: 'execution-log',
      identifierMode: 'request-id',
      logGroups: this.executionLogGroup !== undefined ? [this.executionLogGroup] : [],
      timeRange: { start: startStr ?? null, end: endStr ?? null },
      modeVar: QUERY_MODE_VAR,
    };
  }

  /**
   * Operational services this step uses.
   *
   * @returns The required service names
   */
  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['cloudWatchLogs'];
  }

  override async execute(
    context: OperationalContext,
  ): Promise<StepResult<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>>> {
    return executeStep('API Gateway execution logs query', async () => {
      const upstream = readStepOutput<ReadonlyArray<GOLogsInsightsResultField[]>>(context, this.fromStep);
      if (!upstream.ok) return upstream.failure;
      const accessLogRows = upstream.value;
      // Every request in error with a usable request id is looked up, whatever its errorMessage.
      const eligibleRows = accessLogRows.filter((row) =>
        rowMeetsThreshold(row, this.minStatusCode, this.accessLogSchema),
      );
      if (eligibleRows.length === 0) {
        return {
          success: true,
          output: [],
          vars: {
            [QUERY_MODE_VAR]: 'skipped',
            apiGwExecutionLogRequestCount: '0',
            apiGwExecutionLogCount: '0',
          },
        };
      }

      if (this.executionLogGroup === undefined || this.executionLogGroup.trim() === '') {
        return {
          success: true,
          output: [],
          vars: {
            [QUERY_MODE_VAR]: 'not-configured',
            apiGwExecutionLogRequestCount: '0',
            apiGwExecutionLogCount: '0',
          },
        };
      }
      const executionLogGroup = this.executionLogGroup;

      const reporter = new ApiGwReporter(context.services.reporter);
      const requestIds = collectRequestIds(eligibleRows, this.accessLogSchema);
      if (requestIds.length === 0) {
        return {
          success: true,
          output: [],
          vars: {
            [QUERY_MODE_VAR]: 'no-request-id',
            apiGwExecutionLogGroup: executionLogGroup,
            apiGwExecutionLogRequestCount: '0',
            apiGwExecutionLogRequestIds: '',
            apiGwExecutionLogPaths: '',
            apiGwExecutionLogCount: '0',
          },
          coverage: [{ source: executionLogGroup, complete: false, reason: 'skipped', detail: 'requestId mancante' }],
        };
      }

      reporter?.sectionApiGwExecutionLog();
      reporter?.apiGwExecutionLogQuery(executionLogGroup, requestIds);

      // One query per batch of request ids, within the limit of the predicates of a query.
      const limit = Math.max(1, this.maxRequestIdsOverride ?? this.spec.maxRequestIds);
      const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
      const output: GOLogsInsightsResultField[][] = [];
      const coverage: StepCoverage[] = [];
      const diagnostics: (StepDiagnostics | undefined)[] = [];
      let failures = 0;
      let lastFailure = '';
      const incomplete: string[] = [];
      for (let start = 0; start < requestIds.length; start += limit) {
        const batch = requestIds.slice(start, start + limit);
        let queryResult: ExecutedCloudWatchLogsQuery;
        try {
          queryResult = await executeCloudWatchLogsQuery(
            context,
            [executionLogGroup],
            this.buildExecutionLogQuery(batch),
            timeRange,
            {
              ...(context.signal !== undefined ? { signal: context.signal } : {}),
              logGroupResolutionMode: 'search-configured-profiles',
            },
          );
        } catch (error: unknown) {
          // A failed batch keeps the rows of the others: its requests are read incompletely.
          if (context.signal?.aborted === true) throw error;
          lastFailure = error instanceof Error ? error.message : String(error);
          reporter?.queryFailed([executionLogGroup], lastFailure);
          failures += 1;
          incomplete.push(...batch.map((request) => request.requestId));
          coverage.push({
            source: executionLogGroup,
            complete: false,
            reason: 'unavailable',
            detail: lastFailure,
            scoped: true,
          });
          continue;
        }
        diagnostics.push(queryResult.diagnostics);
        coverage.push(...queryResult.coverage.map((entry) => ({ ...entry, scoped: true })));
        // A saturated batch keeps its rows; its requests are read incompletely too.
        if (queryResult.coverage.some((entry) => !entry.complete)) {
          incomplete.push(...batch.map((request) => request.requestId));
        }
        for (const row of queryResult.rows) {
          const message = readRowField(row, '@message') ?? '';
          const prefixed = EXECUTION_LOG_REQUEST_PREFIX.exec(message)?.[1];
          // A line belongs to the request of its leading `(<requestId>)`; any other line has no verifiable owner.
          const matched = prefixed === undefined ? undefined : batch.find((req) => req.requestId === prefixed);
          if (matched === undefined) continue;
          output.push([
            ...row,
            { field: 'requestId', value: matched?.requestId ?? '' },
            { field: 'path', value: matched?.path ?? '' },
          ]);
        }
      }

      // No batch answered: nothing was read.
      if (failures === Math.ceil(requestIds.length / limit)) {
        return this.buildUnavailableResult(requestIds, lastFailure, eligibleRows);
      }

      reporter?.apiGwExecutionLogResult(output.length);
      const merged = mergeCloudWatchLogsDiagnostics(diagnostics);

      return {
        success: true,
        output,
        ...(merged !== undefined ? { diagnostics: merged } : {}),
        ...withSkippedRequests(coverage, eligibleRows, this.accessLogSchema, executionLogGroup),
        vars: {
          [QUERY_MODE_VAR]: 'queried',
          apiGwExecutionLogGroup: executionLogGroup,
          apiGwExecutionLogRequestCount: String(requestIds.length),
          apiGwExecutionLogRequestIds: requestIds.map((request) => request.requestId).join(','),
          apiGwExecutionLogPaths: requestIds.map((request) => request.path).join(','),
          apiGwExecutionLogCount: String(output.length),
          ...(incomplete.length > 0 ? { [INCOMPLETE_REQUESTS_VAR]: incomplete.join(',') } : {}),
        },
      };
    });
  }

  private buildUnavailableResult(
    requestIds: ReadonlyArray<RequestIdWithPath>,
    reason: string,
    eligibleRows: ReadonlyArray<GOLogsInsightsResultField[]>,
  ): StepResult<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>> {
    return {
      success: true,
      output: [],
      vars: {
        [QUERY_MODE_VAR]: 'unavailable',
        apiGwExecutionLogGroup: this.executionLogGroup ?? '',
        apiGwExecutionLogRequestCount: String(requestIds.length),
        apiGwExecutionLogRequestIds: requestIds.map((request) => request.requestId).join(','),
        apiGwExecutionLogPaths: requestIds.map((request) => request.path).join(','),
        apiGwExecutionLogCount: '0',
        apiGwExecutionLogUnavailableReason: reason,
      },
      // The lookup failed, and the errors without a request id could not be looked up in any case.
      ...withSkippedRequests(
        [
          {
            source: this.executionLogGroup ?? 'execution-logs',
            complete: false,
            reason: 'unavailable',
            detail: reason,
          },
        ],
        eligibleRows,
        this.accessLogSchema,
        this.executionLogGroup,
      ),
    };
  }

  /**
   * The query of a batch of request ids, combined in `OR`.
   */
  private buildExecutionLogQuery(requestIds: ReadonlyArray<RequestIdWithPath>): string {
    const predicates = requestIds.map((req) =>
      renderQueryTemplate(this.spec.requestIdPredicateTemplate, {
        values: { '{{VALUE}}': req.requestId },
        escape: 'sql',
        queryId: `${this.queryProfileId}.executionLog.requestIdPredicate`,
      }),
    );
    const filterClause = `filter ${predicates.map((p) => `(${p})`).join(' or ')}`;

    return renderQueryTemplate(this.spec.queryTemplate, {
      values: { '{{REQUEST_ID_FILTER_CLAUSE}}': filterClause },
      escape: 'none',
      queryId: `${this.queryProfileId}.executionLog`,
    });
  }
}

/**
 * The coverage of the execution-log read, with a `skipped` entry when some eligible errors carry no usable request id:
 * those errors could not be looked up even though the others were.
 *
 * @returns The coverage to declare, absent when the read is complete
 */
function withSkippedRequests(
  coverage: ReadonlyArray<StepCoverage>,
  rows: ReadonlyArray<GOLogsInsightsResultField[]>,
  schema: AccessLogSchema,
  executionLogGroup: string | undefined,
): Pick<StepResult<unknown>, 'coverage'> {
  const withoutId = rows.filter(
    (row) => !REQUEST_ID.test(sanitizeApiGwField(readRowField(row, schema.requestIdField), schema)),
  );
  const entries =
    withoutId.length === 0
      ? coverage
      : [
          ...coverage,
          {
            source: executionLogGroup ?? 'execution-logs',
            complete: false,
            reason: 'skipped' as const,
            detail: `${String(withoutId.length)} errori senza requestId`,
          },
        ];
  return entries.length === 0 ? {} : { coverage: entries };
}

function collectRequestIds(
  rows: ReadonlyArray<GOLogsInsightsResultField[]>,
  schema: AccessLogSchema,
): ReadonlyArray<RequestIdWithPath> {
  const byRequestId = new Map<string, RequestIdWithPath>();
  for (const row of rows) {
    const requestId = sanitizeApiGwField(readRowField(row, schema.requestIdField), schema);
    if (!REQUEST_ID.test(requestId)) continue;

    const rawPath = sanitizeApiGwField(readRowField(row, schema.pathField), schema);
    const path = rawPath === '' ? requestId : rawPath;
    if (!byRequestId.has(requestId)) {
      byRequestId.set(requestId, { path, requestId });
    }
  }
  return [...byRequestId.values()];
}
