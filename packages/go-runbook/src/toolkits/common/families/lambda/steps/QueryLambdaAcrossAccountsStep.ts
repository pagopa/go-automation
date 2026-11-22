import { readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { executeStep, readStepOutput } from '../../../../../engine/index.js';
import type { Step, StepCoverage, StepKind, StepResult } from '../../../../../engine/index.js';
import { accountScopedContexts } from '../../../accounts/accountScopedContexts.js';
import type { AwsAccountSelection } from '../../../accounts/AwsAccountSelection.js';
import { awsLogicalAccountName } from '../../../accounts/awsLogicalAccountName.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { OperationalServiceName } from '../../../services/OperationalServiceName.js';
import type { CloudWatchLogsReadAttempt } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsReadAttempt.js';
import { tryCloudWatchLogsRead } from '../../../steps/aws/cloudwatch-logs/tryCloudWatchLogsRead.js';
import { mergeCloudWatchLogsDiagnostics } from '../../../steps/aws/cloudwatch-logs/mergeCloudWatchLogsDiagnostics.js';
import { OperationalStep } from '../../../steps/OperationalStep.js';
import { ALARM_TIME_RANGE } from '../../../time/ALARM_TIME_RANGE.js';
import { resolveTimeRange } from '../../../time/resolveTimeRange.js';
import {
  INVOCATION_BATCH_SIZE,
  lambdaInvocationQuery,
  sampleLambdaInvocationQuery,
} from '../helpers/lambdaRequestIdFilter.js';
import { requestIdsOf } from '../helpers/requestIdsOf.js';
import { rowsOfInvocations } from '../helpers/rowsOfInvocations.js';
import { lambdaRowRequestId } from '../helpers/lambdaRowRequestId.js';
import { DEFAULT_LAMBDA_INVOCATION_QUERY } from '../queries/DEFAULT_LAMBDA_INVOCATION_QUERY.js';
import type { QueryLambdaAcrossAccountsConfig } from '../types/QueryLambdaAcrossAccountsConfig.js';
import type { CloudWatchLogsRow } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';
import type { CloudWatchLogsRows } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';
import type { InvocationRun } from './InvocationRun.js';
import type { LambdaLogSource } from './LambdaLogSource.js';

/** Extra queries that split saturated batches, over the whole execution: the initial batches never count. */
const MAX_SPLIT_QUERIES = 100;
/** Row limit of every query; reaching it means the result may be truncated. */
const QUERY_ROW_LIMIT = 1000;
const ERRORS_STEP_ID = 'query-lambda-errors';

/**
 * Reads a Lambda log group that exists with the same name in several accounts.
 * Replaces the per-runbook copies of the SEND
 * `pn-downstream-monitoring-lambda` and `DailyExport` alarms.
 *
 * - `errors`: one error scan per source; a scan at the row limit is declared
 *   `saturated`, because the invocation reconstruction may miss request ids.
 * - `invocation`: the invocations of the request ids found by the `query-lambda-errors`
 *   step, in batches per source, splitting a saturated batch, within a query budget.
 *
 * Every row is tagged with its source (`sourceAccount` or `sourceKey`) and the
 * rows of all sources are returned in timestamp order.
 */
export class QueryLambdaAcrossAccountsStep
  extends OperationalStep<CloudWatchLogsRows>
  implements Step<CloudWatchLogsRows>
{
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
            queryTemplate: sampleLambdaInvocationQuery(DEFAULT_LAMBDA_INVOCATION_QUERY),
            correlation: `${this.sourceField()} + requestId`,
            batchSize: INVOCATION_BATCH_SIZE,
            maxSplitQueries: MAX_SPLIT_QUERIES,
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
  override async execute(context: OperationalContext): Promise<StepResult<CloudWatchLogsRows>> {
    const upstream =
      this.config.queryKind === 'invocation' ? readStepOutput<CloudWatchLogsRows>(context, ERRORS_STEP_ID) : undefined;
    if (upstream !== undefined && !upstream.ok) return upstream.failure;

    return executeStep(context, this.config.labels.narrative, async () => {
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
        timeRange: resolveTimeRange(context, ALARM_TIME_RANGE),
        splits: 0,
      };
      const results: CloudWatchLogsReadAttempt[] = [];
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
      // No read answered: the step has nothing to report.
      const firstFailure = results.find((result) => result.failure !== undefined)?.failure;
      if (firstFailure !== undefined && results.every((result) => result.failure !== undefined)) throw firstFailure;
      const rows = results
        .flatMap((result) => result.rows)
        .sort((a, b) => (readRowField(a, '@timestamp') ?? '').localeCompare(readRowField(b, '@timestamp') ?? ''));
      const diagnostics = mergeCloudWatchLogsDiagnostics(results.map((result) => result.diagnostics));
      const coverage = results.flatMap((result) => result.coverage);
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
        ...(coverage.length > 0 ? { coverage } : {}),
      };
    });
  }

  /**
   * Reads a source: the error scan, or a batch of request ids. A saturated batch is split in two, within the budget of
   * the extra queries, and the halves replace it; a half that stays incomplete keeps the rows the saturated read
   * found for its request ids. A read that cannot be completed keeps its rows and declares the source `saturated`.
   * A failed read is an `unavailable` read of the source for the request ids of its batch; a cancellation or a
   * configuration error of the target ends the step.
   */
  private async queryRows(
    context: OperationalContext,
    source: LambdaLogSource,
    batch: ReadonlyArray<string> | undefined,
    run: InvocationRun,
  ): Promise<ReadonlyArray<CloudWatchLogsReadAttempt>> {
    const query =
      batch === undefined ? this.config.errorQuery : lambdaInvocationQuery(DEFAULT_LAMBDA_INVOCATION_QUERY, batch);
    const result = await tryCloudWatchLogsRead(source.context, {
      logGroups: [this.config.logGroup],
      query,
      timeRange: run.timeRange,
      options: { paginateResults: true },
      identifiers: (batch ?? []).map((requestId) => ({ kind: 'requestId', value: requestId })),
      source: source.key,
    });
    if (result.failure !== undefined) return [{ rows: [], failure: result.failure, coverage: result.coverage }];
    const diagnostics = result.diagnostics === undefined ? {} : { diagnostics: result.diagnostics };
    const tag = { field: this.sourceField(), value: source.key };
    const own = batch === undefined ? result.rows : rowsOfInvocations(result.rows, batch);
    const rows = own.map((row) => [...row, tag]);
    if (result.rows.length < QUERY_ROW_LIMIT) return [{ rows, ...diagnostics, coverage: result.coverage }];
    const saturated = (detail: string): StepCoverage => ({
      source: source.key,
      complete: false,
      reason: 'saturated',
      detail,
    });
    if (batch === undefined) {
      const message = `Lambda error scan in ${source.display} reached the ${String(QUERY_ROW_LIMIT)}-row limit`;
      context.services.reporter.add({ label: message });
      return [{ rows, ...diagnostics, coverage: [...unread(result.coverage), saturated(message)] }];
    }
    if (batch.length === 1 || run.splits + 2 > MAX_SPLIT_QUERIES) {
      const detail =
        batch.length === 1
          ? `invocation ${batch[0] ?? ''} reached the ${String(QUERY_ROW_LIMIT)}-row limit`
          : `${String(batch.length)} invocations not split: query budget of ${String(MAX_SPLIT_QUERIES)} exhausted`;
      return [{ rows, ...diagnostics, coverage: [...unread(result.coverage), saturated(detail)] }];
    }
    run.splits += 2;
    const middle = Math.ceil(batch.length / 2);
    const reads: CloudWatchLogsReadAttempt[] = [{ rows: [], ...diagnostics, coverage: unread(result.coverage) }];
    for (const half of [batch.slice(0, middle), batch.slice(middle)]) {
      const halfReads = await this.queryRows(context, source, half, run);
      reads.push(...halfReads);
      if (!halfReads.some((read) => read.coverage.some((entry) => !entry.complete))) continue;
      // The half is still incomplete: the saturated read keeps the rows of its invocations, without duplicates.
      const ids = new Set(half);
      const seen = new Set(halfReads.flatMap((read) => read.rows.map((row) => rowIdentity(row))));
      reads.push({
        rows: rows.filter((row) => ids.has(lambdaRowRequestId(row) ?? '') && !seen.has(rowIdentity(row))),
        coverage: [],
      });
    }
    return reads;
  }

  private requestIdsBySource(
    rows: CloudWatchLogsRows,
    sourceKeys: ReadonlyArray<string>,
  ): Map<string, ReadonlyArray<string>> {
    const rowsBySource = new Map<string, CloudWatchLogsRow[]>(sourceKeys.map((key) => [key, []]));
    for (const row of rows) {
      const source = readRowField(row, this.sourceField()) ?? '';
      const sourceRows = rowsBySource.get(source);
      if (sourceRows === undefined) {
        throw new Error(`invalid error-row source ${source || '(missing)'}`);
      }
      sourceRows.push(row);
    }
    return new Map([...rowsBySource].map(([source, sourceRows]) => [source, requestIdsOf(sourceRows)]));
  }

  private errorVars(sourceKeys: ReadonlyArray<string>, rows: CloudWatchLogsRows): Readonly<Record<string, string>> {
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
    return accountScopedContexts(context, selection).map((account) => ({
      key: account.name,
      display: `${account.name} (${account.account.accountId})`,
      context: account.context,
    }));
  }

  private sourceField(): 'sourceAccount' | 'sourceKey' {
    return this.config.sources === 'configured-sources' ? 'sourceKey' : 'sourceAccount';
  }
}

/** The identity of a row, to keep a row of two reads once. */
function rowIdentity(row: CloudWatchLogsRow): string {
  return row.map(({ field, value }) => `${field ?? ''}=${value ?? ''}`).join('\u0001');
}

/** The parts of a read that failed: they stay beside the saturation the step declares. */
function unread(coverage: ReadonlyArray<StepCoverage>): ReadonlyArray<StepCoverage> {
  return coverage.filter((entry) => !entry.complete && entry.reason === 'unavailable');
}
