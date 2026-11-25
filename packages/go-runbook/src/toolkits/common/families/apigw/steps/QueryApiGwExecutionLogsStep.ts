import { type GOLogsInsightsResultField, readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { getErrorMessage } from '@pagopa/go-common/errors';
import { omitUndefined } from '@pagopa/go-common/utils';
import type { RunbookContext, Step, StepCoverage, StepKind, StepResult } from '../../../../../engine/index.js';
import { executeStep, readStepOutput } from '../../../../../engine/index.js';
import { isRequestId } from '../../../../../engine/internal.js';
import type { TimeRangeFromParams } from '../../../time/TimeRangeFromParams.js';
import { resolveTimeRange } from '../../../time/resolveTimeRange.js';
import type { CloudWatchLogsBatchedReadResult } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsBatchedReadResult.js';
import { endsCloudWatchLogsRead } from '../../../steps/aws/cloudwatch-logs/endsCloudWatchLogsRead.js';
import { readCloudWatchLogsBatches } from '../../../steps/aws/cloudwatch-logs/readCloudWatchLogsBatches.js';
import { logRowIdentity } from '../../../steps/aws/cloudwatch-logs/logRowIdentity.js';
import { SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS } from '../../../steps/aws/cloudwatch-logs/SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS.js';
import { readAccessLogField, rowMeetsThreshold } from '../accessLog/accessLogRow.js';
import { ApiGwReporter } from '../reporting/ApiGwReporter.js';
import type { ExecutionLogSpec } from '../executionLog/ExecutionLogSpec.js';
import type { AccessLogSchema } from '../accessLog/AccessLogSchema.js';
import { renderQueryTemplate } from '../../../queries/renderQueryTemplate.js';
import { OperationalStep } from '../../../steps/OperationalStep.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { OperationalServiceName } from '../../../services/OperationalServiceName.js';
import type { CloudWatchLogsRows } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';
import type { QueryApiGwExecutionLogsConfig } from './QueryApiGwExecutionLogsConfig.js';
import type { RequestIdWithPath } from './RequestIdWithPath.js';

const QUERY_MODE_VAR = 'apiGwExecutionLogMode';

/** Leading `(<requestId>)` of an API Gateway execution-log line. */
const EXECUTION_LOG_REQUEST_PREFIX = /^\(([^()\s]+)\)/u;

/**
 * Reads the API Gateway execution log of the requests in error, a query per batch of request ids, and publishes the
 * mode of the read (`skipped`, `not-configured`, `no-request-id`, `queried`, `unavailable`).
 */
export class QueryApiGwExecutionLogsStep
  extends OperationalStep<CloudWatchLogsRows>
  implements Step<CloudWatchLogsRows>
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

  override async execute(context: OperationalContext): Promise<StepResult<CloudWatchLogsRows>> {
    return executeStep(context, 'API Gateway execution logs query', async () => {
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
          vars: executionLogVars('skipped'),
        };
      }

      if (this.executionLogGroup === undefined || this.executionLogGroup.trim() === '') {
        return {
          success: true,
          output: [],
          vars: executionLogVars('not-configured'),
        };
      }
      const executionLogGroup = this.executionLogGroup;

      const reporter = new ApiGwReporter(context.services.reporter);
      const requestIds = collectRequestIds(eligibleRows, this.accessLogSchema);
      if (requestIds.length === 0) {
        return {
          success: true,
          output: [],
          vars: executionLogVars('no-request-id', executionLogGroup, requestIds),
          coverage: [{ source: executionLogGroup, complete: false, reason: 'skipped', detail: 'requestId mancante' }],
        };
      }

      reporter.sectionApiGwExecutionLog();
      reporter.apiGwExecutionLogQuery(executionLogGroup, requestIds);

      // One query per batch of request ids, within the limit of the predicates of a query.
      const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
      let read: CloudWatchLogsBatchedReadResult;
      try {
        read = await readCloudWatchLogsBatches(context, {
          logGroups: [executionLogGroup],
          timeRange,
          options: SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS,
          items: requestIds,
          ...omitUndefined({ batchSize: this.maxRequestIdsOverride ?? this.spec.maxRequestIds }),
          query: (batch) => this.buildExecutionLogQuery(batch),
          identifier: (request) => ({ kind: 'requestId', value: request.requestId }),
          rowsOf: (rows, batch) => attributeExecutionLogRows(rows, batch),
          belongs: (row, request) =>
            EXECUTION_LOG_REQUEST_PREFIX.exec(readRowField(row, '@message') ?? '')?.[1] === request.requestId,
          rowIdentity: logRowIdentity,
        });
      } catch (error: unknown) {
        // No batch answered: nothing was read.
        if (endsCloudWatchLogsRead(context, error)) throw error;
        const reason = getErrorMessage(error);
        reporter.queryFailed([executionLogGroup], reason);
        return this.buildUnavailableResult(executionLogGroup, requestIds, reason, eligibleRows);
      }
      // A failed batch keeps the rows of the others: its requests are read incompletely.
      for (const failure of read.failures) reporter.queryFailed([executionLogGroup], failure.message);
      const output = read.rows;

      reporter.apiGwExecutionLogResult(output.length);

      return {
        success: true,
        output,
        ...(read.diagnostics !== undefined ? { diagnostics: read.diagnostics } : {}),
        ...withSkippedRequests(read.coverage, eligibleRows, this.accessLogSchema, executionLogGroup),
        vars: executionLogVars('queried', executionLogGroup, requestIds, output.length),
      };
    });
  }

  private buildUnavailableResult(
    executionLogGroup: string,
    requestIds: ReadonlyArray<RequestIdWithPath>,
    reason: string,
    eligibleRows: ReadonlyArray<GOLogsInsightsResultField[]>,
  ): StepResult<CloudWatchLogsRows> {
    return {
      success: true,
      output: [],
      vars: {
        ...executionLogVars('unavailable', executionLogGroup, requestIds),
        apiGwExecutionLogUnavailableReason: reason,
      },
      // The lookup failed, and the errors without a request id could not be looked up in any case.
      ...withSkippedRequests(
        [
          {
            source: executionLogGroup,
            complete: false,
            reason: 'unavailable',
            detail: reason,
          },
        ],
        eligibleRows,
        this.accessLogSchema,
        executionLogGroup,
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
 * The vars of the execution-log lookup: its mode and, when the group was reached, the group, the requests looked up
 * and the rows found.
 */
function executionLogVars(
  mode: string,
  executionLogGroup?: string,
  requestIds: ReadonlyArray<RequestIdWithPath> = [],
  logCount = 0,
): Record<string, string> {
  return {
    [QUERY_MODE_VAR]: mode,
    ...(executionLogGroup === undefined
      ? {}
      : {
          apiGwExecutionLogGroup: executionLogGroup,
          apiGwExecutionLogRequestIds: requestIds.map((request) => request.requestId).join(','),
          apiGwExecutionLogPaths: requestIds.map((request) => request.path).join(','),
        }),
    apiGwExecutionLogRequestCount: String(requestIds.length),
    apiGwExecutionLogCount: String(logCount),
  };
}

function withSkippedRequests(
  coverage: ReadonlyArray<StepCoverage>,
  rows: ReadonlyArray<GOLogsInsightsResultField[]>,
  schema: AccessLogSchema,
  executionLogGroup: string,
): Pick<StepResult<unknown>, 'coverage'> {
  const withoutId = rows.filter((row) => !isRequestId(readAccessLogField(row, schema.requestIdField, schema) ?? ''));
  const entries =
    withoutId.length === 0
      ? coverage
      : [
          ...coverage,
          {
            source: executionLogGroup,
            complete: false,
            reason: 'skipped' as const,
            detail: `${String(withoutId.length)} errori senza requestId`,
          },
        ];
  return entries.length === 0 ? {} : { coverage: entries };
}

/**
 * The rows of a batch with the request of their leading `(<requestId>)`; any other line has no verifiable owner.
 */
function attributeExecutionLogRows(
  rows: CloudWatchLogsRows,
  batch: ReadonlyArray<RequestIdWithPath>,
): CloudWatchLogsRows {
  const byRequestId = new Map(batch.map((request) => [request.requestId, request]));
  return rows.flatMap((row) => {
    const prefixed = EXECUTION_LOG_REQUEST_PREFIX.exec(readRowField(row, '@message') ?? '')?.[1];
    const matched = prefixed === undefined ? undefined : byRequestId.get(prefixed);
    if (matched === undefined) return [];
    return [[...row, { field: 'requestId', value: matched.requestId }, { field: 'path', value: matched.path }]];
  });
}

function collectRequestIds(
  rows: ReadonlyArray<GOLogsInsightsResultField[]>,
  schema: AccessLogSchema,
): ReadonlyArray<RequestIdWithPath> {
  const byRequestId = new Map<string, RequestIdWithPath>();
  for (const row of rows) {
    const requestId = readAccessLogField(row, schema.requestIdField, schema) ?? '';
    if (!isRequestId(requestId)) continue;

    const path = readAccessLogField(row, schema.pathField, schema) ?? requestId;
    if (!byRequestId.has(requestId)) {
      byRequestId.set(requestId, { path, requestId });
    }
  }
  return [...byRequestId.values()];
}
