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
import { LAMBDA_REQUEST_ID, lambdaInvocationQuery } from '../helpers/lambdaRequestIdFilter.js';
import { rowsOfInvocations } from '../helpers/rowsOfInvocations.js';
import { lambdaRowRequestId } from '../helpers/lambdaRowRequestId.js';
import { DEFAULT_LAMBDA_INVOCATION_QUERY } from '../queries/DEFAULT_LAMBDA_INVOCATION_QUERY.js';
import type { StepCoverage } from '../../../../../engine/types/StepCoverage.js';
import type { QueryLambdaAcrossAccountsConfig } from '../types/QueryLambdaAcrossAccountsConfig.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;

/** Request ids per invocation query: at most 80 queries for the 2,000 rows of two error scans. */
const INVOCATION_BATCH_SIZE = 25;
/** Extra queries that split saturated batches, over the whole execution: the initial batches never count. */
const MAX_SPLIT_QUERIES = 100;
/** Row limit of every query; reaching it means the result may be truncated. */
const QUERY_ROW_LIMIT = 1000;
const ERRORS_STEP_ID = 'query-lambda-errors';

/** Time range and split queries used so far, shared by all the sources of one execution. */
interface InvocationRun {
  readonly timeRange: TimeRange;
  splits: number;
}

/** A read of a source: its rows, with the telemetry and the incomplete parts of the read. */
interface SourceRead {
  readonly rows: Rows;
  readonly failed?: boolean;
  readonly diagnostics?: StepDiagnostics;
  readonly coverage?: ReadonlyArray<StepCoverage>;
}

/** One source of the step: the tag written on its rows, how it is named in messages, its reader. */
interface LambdaLogSource {
  readonly key: string;
  readonly display: string;
  readonly context: OperationalContext;
}

/**
 * Reads a Lambda log group that exists with the same name in several accounts.
 * Replaces the per-runbook copies of the SEND
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
            queryTemplate: lambdaInvocationQuery(DEFAULT_LAMBDA_INVOCATION_QUERY, [
              '00000000-0000-0000-0000-000000000000',
            ]),
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
        splits: 0,
      };
      const results: SourceRead[] = [];
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
      const firstFailure = results.find((result) => result.failed === true)?.coverage?.[0]?.detail;
      if (results.length > 0 && results.every((result) => result.failed === true)) {
        throw new Error(firstFailure ?? 'Lambda logs unavailable');
      }
      const rows = results
        .flatMap((result) => result.rows)
        .sort((a, b) => (readRowField(a, '@timestamp') ?? '').localeCompare(readRowField(b, '@timestamp') ?? ''));
      const diagnostics = mergeCloudWatchLogsDiagnostics(results.map((result) => result.diagnostics));
      const coverage = results.flatMap((result) => result.coverage ?? []);
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
   * One query on one source. A saturated invocation batch keeps its diagnostics
   * and is replaced by the results of its two halves.
   */
  /**
   * Reads a source: the error scan, or a batch of request ids. A saturated batch is split in two, within the budget of
   * the extra queries, and the halves replace it; a half that stays incomplete keeps the rows the saturated read
   * found for its request ids. A read that cannot be completed keeps its rows and declares the source `saturated`.
   */
  private async queryRows(
    context: OperationalContext,
    source: LambdaLogSource,
    batch: ReadonlyArray<string> | undefined,
    run: InvocationRun,
  ): Promise<ReadonlyArray<SourceRead>> {
    const query =
      batch === undefined ? this.config.errorQuery : lambdaInvocationQuery(DEFAULT_LAMBDA_INVOCATION_QUERY, batch);
    let result: Awaited<ReturnType<typeof executeCloudWatchLogsQuery>>;
    try {
      result = await executeCloudWatchLogsQuery(source.context, [this.config.logGroup], query, run.timeRange, {
        ...(context.signal === undefined ? {} : { signal: context.signal }),
        paginateResults: true,
      });
    } catch (error: unknown) {
      // An abort or a configuration error ends the step; any other failure is an unavailable read of this source.
      if (context.signal?.aborted === true || isConfigurationError(error)) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      return [
        { rows: [], failed: true, coverage: [{ source: source.key, complete: false, reason: 'unavailable', detail }] },
      ];
    }
    const diagnostics = result.diagnostics === undefined ? {} : { diagnostics: result.diagnostics };
    const tag = { field: this.sourceField(), value: source.key };
    const own = batch === undefined ? result.rows : rowsOfInvocations(result.rows, batch);
    const rows = own.map((row) => [...row, tag]);
    if (result.rows.length < QUERY_ROW_LIMIT) {
      return [{ rows, ...diagnostics, ...(result.coverage.length > 0 ? { coverage: result.coverage } : {}) }];
    }
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
    const reads: SourceRead[] = [{ rows: [], ...diagnostics, coverage: unread(result.coverage) }];
    for (const half of [batch.slice(0, middle), batch.slice(middle)]) {
      const halfReads = await this.queryRows(context, source, half, run);
      reads.push(...halfReads);
      if (!halfReads.some((read) => (read.coverage ?? []).some((entry) => !entry.complete))) continue;
      // The half is still incomplete: the saturated read keeps the rows of its invocations, without duplicates.
      const ids = new Set(half);
      const seen = new Set(halfReads.flatMap((read) => read.rows.map((row) => rowIdentity(row))));
      reads.push({
        rows: rows.filter((row) => ids.has(lambdaRowRequestId(row) ?? '') && !seen.has(rowIdentity(row))),
      });
    }
    return reads;
  }

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
      // A row without a usable request id is an invocation of its own, never reconstructed.
      if (requestId === undefined || !LAMBDA_REQUEST_ID.test(requestId)) continue;
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

/** The identity of a row, to keep a row of two reads once. */
function rowIdentity(row: ReadonlyArray<GOLogsInsightsResultField>): string {
  return row.map(({ field, value }) => `${field ?? ''}=${value ?? ''}`).join('\u0001');
}

/** A configuration error of the execution target, which no other read can recover. */
function isConfigurationError(error: unknown): boolean {
  const code = (error as { readonly code?: unknown } | undefined)?.code;
  return code === 'OAM_REGION_MISMATCH' || code === 'INVALID_OAM_TARGET';
}

/** The parts of a read that failed: they stay beside the saturation the step declares. */
function unread(coverage: ReadonlyArray<StepCoverage>): ReadonlyArray<StepCoverage> {
  return coverage.filter((entry) => !entry.complete && entry.reason === 'unavailable');
}
