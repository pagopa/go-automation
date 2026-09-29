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
/** At most 80 initial queries for the 2,000 rows that the two error scans can return. */
const INVOCATION_BATCH_SIZE = 25;
/** Same sequential fan-out bound used by the INTEROP CID tracker. */
const MAX_INVOCATION_QUERIES = 100;
const QUERY_ROW_LIMIT = 1000;

/** Source q1, with the additional runtime signatures suggested in its comments. */
const BOTH_ACCOUNTS_ERROR_QUERY = `fields @timestamp, @xrayTraceId, @requestId, @message
| filter @message like 'ERROR'
    or @message like /(?i)timed?\\s*out/
    or @message like /(?i)OutOfMemory/
    or @message like /(?i)fatal/
    or @message like /(?i)Status:\\s*error/
| sort @timestamp asc
| limit ${QUERY_ROW_LIMIT}`;

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
        : {
            queryTemplate: invocationQueryFor(['<requestId>']),
            correlation: 'sourceAccount + requestId',
            batchSize: INVOCATION_BATCH_SIZE,
            maxQueries: MAX_INVOCATION_QUERIES,
          }),
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
      let invocationQueryCount = 0;
      for (const source of LAMBDA_LOG_SOURCES) {
        const requestIds = invocationRequestIds?.get(source.name) ?? [];
        if (this.queryKind === 'invocation' && requestIds.length === 0) continue;
        const profile = profiles.get(source.name);
        const cloudWatchLogs = context.services.cloudWatchLogs.forTarget({
          accountId: source.accountId,
          region,
          ...(profile === undefined ? {} : { profile }),
        });
        const scopedContext = { ...context, services: { ...context.services, cloudWatchLogs } };
        const queryBatch = async (batch: ReadonlyArray<string> | undefined): Promise<void> => {
          if (batch !== undefined) {
            if (invocationQueryCount >= MAX_INVOCATION_QUERIES) {
              throw new Error(`Lambda invocation query budget exceeded (${String(MAX_INVOCATION_QUERIES)} queries)`);
            }
            invocationQueryCount += 1;
          }
          const query = batch === undefined ? BOTH_ACCOUNTS_ERROR_QUERY : invocationQueryFor(batch);
          const result = await executeCloudWatchLogsQuery(scopedContext, [LAMBDA_FUNCTION.logGroup], query, timeRange, {
            ...(context.signal === undefined ? {} : { signal: context.signal }),
            paginateResults: true,
          });
          if (batch === undefined && result.rows.length >= QUERY_ROW_LIMIT) {
            const message =
              `Lambda error scan in ${source.name} (${source.accountId}) reached the ` +
              `${String(QUERY_ROW_LIMIT)}-row limit; invocation correlation requires a complete scan`;
            context.services.reporter.add({ label: message });
            throw new Error(message);
          }
          const saturated = batch !== undefined && result.rows.length >= QUERY_ROW_LIMIT;
          // A full batch may omit later request IDs. Keep its diagnostics, then
          // replace its partial rows with the results of narrower queries.
          results.push({
            rows: saturated ? [] : result.rows.map((row) => [...row, { field: 'sourceAccount', value: source.name }]),
            ...(result.diagnostics === undefined ? {} : { diagnostics: result.diagnostics }),
          });
          if (saturated && batch !== undefined) {
            if (batch.length === 1) {
              throw new Error(
                `Lambda invocation ${batch[0]} in ${source.name} reached the ${String(QUERY_ROW_LIMIT)}-row limit`,
              );
            }
            const middle = Math.ceil(batch.length / 2);
            await queryBatch(batch.slice(0, middle));
            await queryBatch(batch.slice(middle));
          }
        };
        if (this.queryKind === 'errors') {
          await queryBatch(undefined);
        } else {
          for (let index = 0; index < requestIds.length; index += INVOCATION_BATCH_SIZE) {
            await queryBatch(requestIds.slice(index, index + INVOCATION_BATCH_SIZE));
          }
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

function invocationQueryFor(requestIds: ReadonlyArray<string>): string {
  const filter = requestIds.map((requestId) => `@requestId = '${requestId}'`).join(' or ');
  return `fields @timestamp, @requestId, @message
| filter ${filter}
| sort @timestamp asc
| limit ${QUERY_ROW_LIMIT}`;
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
