import { parseAwsProfileEntries, readRowField } from '@go-automation/go-common/aws';
import type { AWSCloudWatchLogsQueryStatistics, ResultField } from '@go-automation/go-common/aws';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepResult } from '../../../types/StepResult.js';
import type { StepDiagnostics } from '../../../trace/StepDiagnostics.js';
import { executeCloudWatchLogsQuery } from '../../../steps/data/executeCloudWatchLogsQuery.js';
import { executeStep } from '../../../steps/data/executeStep.js';
import { readStepOutput } from '../../../steps/data/readStepOutput.js';
import { resolveTimeRange } from '../../../steps/data/resolveTimeRange.js';
import { extractLambdaRequestId } from '../../../lambda/helpers/extractLambdaRequestId.js';

import { LAMBDA_FUNCTION, LAMBDA_LOG_SOURCES } from './knownServices.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;
type QueryKind = 'errors' | 'invocation';

/** Source q1, with the additional runtime signatures suggested in its comments. */
const BOTH_ACCOUNTS_ERROR_QUERY = `fields @timestamp, @xrayTraceId, @requestId, @message
| filter @message like 'ERROR'
    or @message like /(?i)timed?\\s*out/
    or @message like /(?i)OutOfMemory/
    or @message like /(?i)fatal/
    or @message like /(?i)Status:\\s*error/
| sort @timestamp asc
| limit 1000`;

/** Reads both production accounts independently, failing if either cannot be checked. */
export class QueryBothLambdaAccountsStep implements Step<Rows> {
  readonly id: string;
  readonly label: string;
  readonly kind = 'data' as const;

  constructor(private readonly queryKind: QueryKind) {
    this.id = queryKind === 'errors' ? 'query-lambda-errors' : 'query-lambda-invocation';
    this.label =
      queryKind === 'errors' ? 'Query errori Lambda core e confinfo' : 'Query invocazione Lambda core e confinfo';
  }

  getTraceInfo(): Readonly<Record<string, unknown>> {
    return {
      queryKind: this.queryKind === 'errors' ? 'lambda-error-scan' : 'lambda-invocation-flow',
      queryProfileId: 'send',
      logGroup: LAMBDA_FUNCTION.logGroup,
      sources: LAMBDA_LOG_SOURCES.map(({ name, accountId }) => ({ name, accountId })),
      ...(this.queryKind === 'errors'
        ? { query: BOTH_ACCOUNTS_ERROR_QUERY }
        : { queryTemplate: invocationQueryFor('<requestId>'), correlation: 'sourceAccount + requestId' }),
    };
  }

  async execute(context: RunbookContext): Promise<StepResult<Rows>> {
    const upstream = this.queryKind === 'invocation' ? readStepOutput<Rows>(context, 'query-lambda-errors') : undefined;
    if (upstream !== undefined && !upstream.ok) return upstream.failure;

    return executeStep('Lambda logs in core and confinfo', async () => {
      const invocationRequestIds = upstream === undefined ? undefined : requestIdsBySource(upstream.value);
      if (invocationRequestIds !== undefined && [...invocationRequestIds.values()].every((ids) => ids.length === 0)) {
        return { success: true, output: [], vars: { lambdaInvocationLogCount: '0' } };
      }
      const { region, profiles } = resolveExecutionSources(context);
      const timeRange = resolveTimeRange(context, { start: 'startTime', end: 'endTime' });
      const results: { rows: Rows; diagnostics?: StepDiagnostics }[] = [];
      for (const source of LAMBDA_LOG_SOURCES) {
        const queries =
          this.queryKind === 'errors'
            ? [BOTH_ACCOUNTS_ERROR_QUERY]
            : (invocationRequestIds?.get(source.name) ?? []).map(invocationQueryFor);
        if (queries.length === 0) continue;
        const profile = profiles.get(source.name);
        const cloudWatchLogs = context.services.cloudWatchLogs.forTarget({
          accountId: source.accountId,
          region,
          ...(profile === undefined ? {} : { profile }),
        });
        const scopedContext = { ...context, services: { ...context.services, cloudWatchLogs } };
        for (const query of queries) {
          const result = await executeCloudWatchLogsQuery(scopedContext, [LAMBDA_FUNCTION.logGroup], query, timeRange, {
            ...(context.signal === undefined ? {} : { signal: context.signal }),
            paginateResults: true,
          });
          results.push({
            rows: result.rows.map((row) => [...row, { field: 'sourceAccount', value: source.name }]),
            ...(result.diagnostics === undefined ? {} : { diagnostics: result.diagnostics }),
          });
        }
      }
      const rows = results
        .flatMap((result) => result.rows)
        .sort((a, b) => (readRowField(a, '@timestamp') ?? '').localeCompare(readRowField(b, '@timestamp') ?? ''));
      const diagnostics = mergeDiagnostics(results.map((result) => result.diagnostics));
      context.services.reporter.add({
        label: `Log Lambda verificati in core e confinfo: ${String(rows.length)} righe`,
      });
      return {
        success: true,
        output: rows,
        ...(this.queryKind === 'invocation' ? { vars: { lambdaInvocationLogCount: String(rows.length) } } : {}),
        ...(diagnostics === undefined ? {} : { diagnostics }),
      };
    });
  }
}

function requestIdsBySource(rows: Rows): Map<string, ReadonlyArray<string>> {
  const idsBySource = new Map<string, Set<string>>(LAMBDA_LOG_SOURCES.map(({ name }) => [name, new Set<string>()]));
  for (const row of rows) {
    const source = readRowField(row, 'sourceAccount') ?? '';
    const ids = idsBySource.get(source);
    if (ids === undefined) {
      throw new Error(`QueryBothLambdaAccountsStep: invalid error-row source ${source || '(missing)'}`);
    }
    const requestId =
      (readRowField(row, '@requestId') ?? '').trim() || extractLambdaRequestId(readRowField(row, '@message') ?? '');
    if (requestId === undefined || requestId === '') continue;
    if (!/^[A-Za-z0-9-]{1,128}$/.test(requestId)) {
      throw new Error('QueryBothLambdaAccountsStep: invalid Lambda requestId');
    }
    ids.add(requestId);
  }
  return new Map([...idsBySource].map(([source, ids]) => [source, [...ids]]));
}

function invocationQueryFor(requestId: string): string {
  return `fields @timestamp, @requestId, @message
| filter @requestId = '${requestId}'
| sort @timestamp asc
| limit 1000`;
}

function resolveExecutionSources(context: RunbookContext): { region: string; profiles: Map<string, string> } {
  const region = context.params.get('awsRegion') ?? 'eu-south-1';
  const accountId = context.params.get('awsAccountId');
  const configuredProfiles = parseAwsProfileEntries((context.params.get('awsProfiles') ?? '').split(',')).profileNames;
  const knownAccounts: ReadonlyArray<string> = LAMBDA_LOG_SOURCES.map((source) => source.accountId);
  if (accountId !== undefined && !knownAccounts.includes(accountId)) {
    throw new Error(`pn-downstream-monitoring-lambda: unsupported occurrence account ${accountId}`);
  }
  if (accountId === undefined && configuredProfiles.length === 0) {
    throw new Error('pn-downstream-monitoring-lambda: core and confinfo AWS profiles are required for local execution');
  }

  const profiles = new Map<string, string>();
  if (configuredProfiles.length > 0) {
    for (const source of LAMBDA_LOG_SOURCES) {
      const profile = source.profiles.find((candidate) => configuredProfiles.includes(candidate));
      if (profile === undefined) {
        if (accountId === undefined) {
          throw new Error(`pn-downstream-monitoring-lambda: missing ${source.name} production AWS profile`);
        }
        continue;
      }
      profiles.set(source.name, profile);
    }
  }
  return { region, profiles };
}

function mergeDiagnostics(diagnostics: ReadonlyArray<StepDiagnostics | undefined>): StepDiagnostics | undefined {
  const values = diagnostics.flatMap((entry) => (entry?.cloudWatchLogs === undefined ? [] : [entry.cloudWatchLogs]));
  if (values.length === 0 || values.length !== diagnostics.length) return undefined;
  const executions = values.flatMap((value) => value.queryExecutions);
  const statistics: AWSCloudWatchLogsQueryStatistics = {
    bytesScanned: values.reduce((sum, value) => sum + value.statistics.bytesScanned, 0),
    recordsScanned: values.reduce((sum, value) => sum + value.statistics.recordsScanned, 0),
    recordsMatched: values.reduce((sum, value) => sum + value.statistics.recordsMatched, 0),
  };
  return {
    cloudWatchLogs: {
      rowsReturned: values.reduce((sum, value) => sum + value.rowsReturned, 0),
      statistics,
      queryExecutions: executions,
    },
  };
}
