import { type GOLogsInsightsResultField, readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { executeStep } from '../../../../../engine/steps/execution/executeStep.js';
import { readStepOutput } from '../../../../../engine/context/readStepOutput.js';
import type { StepDiagnostics } from '../../../../../engine/tracing/StepDiagnostics.js';
import type { Step } from '../../../../../engine/types/Step.js';
import type { StepKind } from '../../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';
import type { AwsAccountSelection } from '../../../accounts/AwsAccountSelection.js';
import { awsLogicalAccountName } from '../../../accounts/awsLogicalAccountName.js';
import { resolveAwsAccountSelection } from '../../../accounts/resolveAwsAccountSelection.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { OperationalServiceName } from '../../../services/OperationalServiceName.js';
import { executeCloudWatchLogsQuery } from '../../../steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
import { mergeCloudWatchLogsDiagnostics } from '../../../steps/aws/cloudwatch-logs/mergeCloudWatchLogsDiagnostics.js';
import { OperationalStep } from '../../../steps/OperationalStep.js';
import { resolveTimeRange } from '../../../time/resolveTimeRange.js';
import type { TimeRange } from '../../../time/TimeRange.js';
import { extractLambdaRequestId } from '../helpers/extractLambdaRequestId.js';
import type { QueryLambdaAcrossAccountsConfig } from '../types/QueryLambdaAcrossAccountsConfig.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;

/** Request ids per invocation query: at most 80 queries for the 2,000 rows of two error scans. */
const INVOCATION_BATCH_SIZE = 25;
/** Same sequential fan-out bound used by the INTEROP CID tracker. */
const MAX_INVOCATION_QUERIES = 100;
/** Row limit of every query; reaching it means the result may be truncated. */
const QUERY_ROW_LIMIT = 1000;
const ERRORS_STEP_ID = 'query-lambda-errors';
const LAMBDA_REQUEST_ID = /^[A-Za-z0-9-]{1,128}$/;

/** Time range and invocation queries used so far, shared by all the sources of one execution. */
interface InvocationRun {
  readonly timeRange: TimeRange;
  used: number;
}

/** One source of the step: the tag written on its rows, how it is named in messages, its reader. */
interface LambdaLogSource {
  readonly key: string;
  readonly display: string;
  readonly context: OperationalContext;
}

/**
 * Reads a Lambda log group that exists with the same name in several accounts
 * (EVO-RBREORG-OPUS-01 P30). Replaces the per-runbook copies of the SEND
 * `pn-downstream-monitoring-lambda` and `DailyExport` alarms.
 *
 * - `errors`: one complete error scan per source; a scan at the row limit fails,
 *   because the invocation reconstruction needs every request id.
 * - `invocation`: the invocations of the request ids found by the `query-lambda-errors`
 *   step, in batches per source, splitting a saturated batch, within a query budget.
 *
 * Every row is tagged with its source (`sourceAccount` or `sourceKey`) and the
 * rows of all sources are returned in timestamp order.
 */
export class QueryLambdaAcrossAccountsStep extends OperationalStep<Rows> implements Step<Rows> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  /**
   * @param config - Log group, sources, texts and variables of the runbook
   */
  constructor(private readonly config: QueryLambdaAcrossAccountsConfig) {
    super();
    this.id = config.queryKind === 'errors' ? ERRORS_STEP_ID : 'query-lambda-invocation';
    this.label = config.queryKind === 'errors' ? config.labels.errors : config.labels.invocation;
  }

  /**
   * Query, sources and fan-out bounds, for the trace.
   *
   * @param context - Operational context
   * @returns The trace fields of the step
   */
  getTraceInfo(context: OperationalContext): Readonly<Record<string, unknown>> {
    const { sources } = this.config;
    return {
      queryKind: this.config.queryKind === 'errors' ? 'lambda-error-scan' : 'lambda-invocation-flow',
      queryProfileId: this.config.queryProfileId,
      logGroup: this.config.logGroup,
      sources:
        sources === 'configured-sources'
          ? context.services.cloudWatchLogs.getConfiguredSources().map(({ key }) => key)
          : sources.accounts,
      ...(this.config.queryKind === 'errors'
        ? { query: this.config.errorQuery }
        : {
            queryTemplate: invocationQueryFor(['<requestId>']),
            correlation: `${this.sourceField()} + requestId`,
            batchSize: INVOCATION_BATCH_SIZE,
            maxQueries: MAX_INVOCATION_QUERIES,
          }),
    };
  }

  /**
   * Operational services this step uses.
   *
   * @returns The required service names
   */
  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return this.config.sources === 'configured-sources' ? ['cloudWatchLogs'] : ['cloudWatchLogs', 'awsAccounts'];
  }

  /**
   * The logical accounts the step reads, when it reads accounts rather than the configured sources.
   *
   * @returns The account selection of the step, if any
   */
  override accountSelections(): ReadonlyArray<AwsAccountSelection> {
    return this.config.sources === 'configured-sources' ? [] : [this.config.sources];
  }

  /**
   * Runs the error scan or the invocation reconstruction on every source.
   *
   * @param context - Operational context
   * @returns The tagged rows and the variables of the query kind
   */
  override async execute(context: OperationalContext): Promise<StepResult<Rows>> {
    const upstream = this.config.queryKind === 'invocation' ? readStepOutput<Rows>(context, ERRORS_STEP_ID) : undefined;
    if (upstream !== undefined && !upstream.ok) return upstream.failure;

    return executeStep(this.config.labels.narrative, async () => {
      const { sources } = this.config;
      const configured = sources === 'configured-sources' ? context.services.cloudWatchLogs.getConfiguredSources() : [];
      if (sources === 'configured-sources' && configured.length === 0) {
        throw new Error('at least one configured log source is required');
      }
      const sourceKeys =
        sources === 'configured-sources'
          ? configured.map(({ key }) => key)
          : sources.accounts.map(awsLogicalAccountName);
      const requestIds = upstream === undefined ? undefined : this.requestIdsBySource(upstream.value, sourceKeys);
      if (requestIds !== undefined && [...requestIds.values()].every((ids) => ids.length === 0)) {
        return { success: true, output: [], vars: { lambdaInvocationLogCount: '0' } };
      }
      const readers: ReadonlyArray<LambdaLogSource> =
        sources === 'configured-sources'
          ? configured.map(({ key, service }) => ({
              key,
              display: key,
              context: { ...context, services: { ...context.services, cloudWatchLogs: service } },
            }))
          : this.accountReaders(context, sources);

      const run: InvocationRun = {
        timeRange: resolveTimeRange(context, { start: 'startTime', end: 'endTime' }),
        used: 0,
      };
      const results: { rows: Rows; diagnostics?: StepDiagnostics }[] = [];
      for (const source of readers) {
        if (requestIds === undefined) {
          results.push(...(await this.queryRows(context, source, undefined, run)));
          continue;
        }
        const ids = requestIds.get(source.key) ?? [];
        for (let index = 0; index < ids.length; index += INVOCATION_BATCH_SIZE) {
          results.push(
            ...(await this.queryRows(context, source, ids.slice(index, index + INVOCATION_BATCH_SIZE), run)),
          );
        }
      }
      const rows = results
        .flatMap((result) => result.rows)
        .sort((a, b) => (readRowField(a, '@timestamp') ?? '').localeCompare(readRowField(b, '@timestamp') ?? ''));
      const diagnostics = mergeCloudWatchLogsDiagnostics(results.map((result) => result.diagnostics));
      context.services.reporter.add({ label: `${this.config.labels.report}: ${String(rows.length)} righe` });
      return {
        success: true,
        output: rows,
        vars:
          this.config.queryKind === 'invocation'
            ? { lambdaInvocationLogCount: String(rows.length) }
            : this.errorVars(
                readers.map(({ key }) => key),
                rows,
              ),
        ...(diagnostics === undefined ? {} : { diagnostics }),
      };
    });
  }

  /**
   * One query on one source. A saturated invocation batch keeps its diagnostics
   * and is replaced by the results of its two halves.
   */
  private async queryRows(
    context: OperationalContext,
    source: LambdaLogSource,
    batch: ReadonlyArray<string> | undefined,
    run: InvocationRun,
  ): Promise<ReadonlyArray<{ rows: Rows; diagnostics?: StepDiagnostics }>> {
    if (batch !== undefined) {
      if (run.used >= MAX_INVOCATION_QUERIES) {
        throw new Error(`Lambda invocation query budget exceeded (${String(MAX_INVOCATION_QUERIES)} queries)`);
      }
      run.used += 1;
    }
    const query = batch === undefined ? this.config.errorQuery : invocationQueryFor(batch);
    const result = await executeCloudWatchLogsQuery(source.context, [this.config.logGroup], query, run.timeRange, {
      ...(context.signal === undefined ? {} : { signal: context.signal }),
      paginateResults: true,
    });
    const diagnostics = result.diagnostics === undefined ? {} : { diagnostics: result.diagnostics };
    if (result.rows.length < QUERY_ROW_LIMIT) {
      const tag = { field: this.sourceField(), value: source.key };
      return [{ rows: result.rows.map((row) => [...row, tag]), ...diagnostics }];
    }
    if (batch === undefined) {
      const message =
        `Lambda error scan in ${source.display} reached the ${String(QUERY_ROW_LIMIT)}-row limit; ` +
        'invocation correlation requires a complete scan';
      context.services.reporter.add({ label: message });
      throw new Error(message);
    }
    if (batch.length === 1) {
      throw new Error(
        `Lambda invocation ${batch[0] ?? ''} in ${source.key} reached the ${String(QUERY_ROW_LIMIT)}-row limit`,
      );
    }
    const middle = Math.ceil(batch.length / 2);
    const first = await this.queryRows(context, source, batch.slice(0, middle), run);
    const second = await this.queryRows(context, source, batch.slice(middle), run);
    return [{ rows: [], ...diagnostics }, ...first, ...second];
  }

  /** Request ids of the error rows, by source; a row of an unknown source or a malformed id fails. */
  private requestIdsBySource(rows: Rows, sourceKeys: ReadonlyArray<string>): Map<string, ReadonlyArray<string>> {
    const idsBySource = new Map<string, Set<string>>(sourceKeys.map((key) => [key, new Set<string>()]));
    for (const row of rows) {
      const source = readRowField(row, this.sourceField()) ?? '';
      const ids = idsBySource.get(source);
      if (ids === undefined) {
        throw new Error(`invalid error-row source ${source || '(missing)'}`);
      }
      const requestId =
        (readRowField(row, '@requestId') ?? '').trim() || extractLambdaRequestId(readRowField(row, '@message') ?? '');
      if (requestId === undefined || requestId === '') continue;
      if (!LAMBDA_REQUEST_ID.test(requestId)) throw new Error('invalid Lambda requestId');
      ids.add(requestId);
    }
    return new Map([...idsBySource].map(([source, ids]) => [source, [...ids]]));
  }

  private errorVars(sourceKeys: ReadonlyArray<string>, rows: Rows): Readonly<Record<string, string>> {
    const { checked, total, bySource } = this.config.errorVars;
    const counts = new Map<string, number>();
    for (const row of rows) {
      const source = readRowField(row, this.sourceField()) ?? '';
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }
    return {
      [checked]: sourceKeys.join(','),
      ...(total === undefined ? {} : { [total]: String(rows.length) }),
      ...Object.fromEntries(
        Object.entries(bySource ?? {}).map(([source, name]) => [name, String(counts.get(source) ?? 0)]),
      ),
    };
  }

  /** Readers of the resolved logical accounts, prepared by the pre-execution check. */
  private accountReaders(context: OperationalContext, selection: AwsAccountSelection): ReadonlyArray<LambdaLogSource> {
    const port = context.services.awsAccounts;
    if (port === undefined) throw new Error('the account port is required to read logical accounts');
    return resolveAwsAccountSelection(context, selection).map((resolved) => {
      const name = awsLogicalAccountName(resolved.account);
      const cloudWatchLogs = port.cloudWatchLogsFor(resolved.account);
      return {
        key: name,
        display: `${name} (${resolved.accountId})`,
        context: { ...context, services: { ...context.services, cloudWatchLogs } },
      };
    });
  }

  private sourceField(): 'sourceAccount' | 'sourceKey' {
    return this.config.sources === 'configured-sources' ? 'sourceKey' : 'sourceAccount';
  }
}

function invocationQueryFor(requestIds: ReadonlyArray<string>): string {
  const filter = requestIds
    .map((requestId) => `(@requestId = '${requestId}' or @message like '${requestId}')`)
    .join(' or ');
  return `fields @timestamp, @requestId, @message
| filter ${filter}
| sort @timestamp asc
| limit ${String(QUERY_ROW_LIMIT)}`;
}
