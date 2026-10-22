import { readRowField, sumCloudWatchLogsQueryStatistics } from '@go-automation/go-common/aws';
import type { ResultField } from '@go-automation/go-common/aws';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepResult } from '../../../types/StepResult.js';
import type { StepDiagnostics } from '../../../trace/StepDiagnostics.js';
import { executeCloudWatchLogsQuery } from '../../../steps/data/executeCloudWatchLogsQuery.js';
import { executeStep } from '../../../steps/data/executeStep.js';
import { readStepOutput } from '../../../steps/data/readStepOutput.js';
import { resolveTimeRange } from '../../../steps/data/resolveTimeRange.js';
import { extractLambdaRequestId } from '../../../lambda/helpers/extractLambdaRequestId.js';

import { LAMBDA_FUNCTION } from './knownServices.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;
type QueryKind = 'errors' | 'invocation';
/** Request IDs per query; the total fan-out remains bounded across all configured sources. */
const INVOCATION_BATCH_SIZE = 25;
/** Same sequential fan-out bound used by the INTEROP CID tracker. */
const MAX_INVOCATION_QUERIES = 100;
const QUERY_ROW_LIMIT = 1000;

/** Error signatures from Confluence v1 and the observed timeout REPORT. */
const ERROR_QUERY = `fields @timestamp, @requestId, @message
| filter @message like 'ERROR'
    or @message like /(?i)timed?\\s*out/
    or @message like /(?i)Status:\\s*timeout/
| sort @timestamp asc
| limit ${QUERY_ROW_LIMIT}`;

/** Reads one cloud occurrence source or all configured local sources without widening the scope. */
export class QueryDailyExportAccountsStep implements Step<Rows> {
  readonly id: string;
  readonly label: string;
  readonly kind = 'data' as const;

  constructor(private readonly queryKind: QueryKind) {
    this.id = queryKind === 'errors' ? 'query-lambda-errors' : 'query-lambda-invocation';
    this.label =
      queryKind === 'errors'
        ? 'Query errori Lambda sulle sorgenti configurate'
        : 'Query invocazione Lambda sulle sorgenti configurate';
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    return {
      queryKind: this.queryKind === 'errors' ? 'lambda-error-scan' : 'lambda-invocation-flow',
      queryProfileId: 'send',
      logGroup: LAMBDA_FUNCTION.logGroup,
      sources: context.services.cloudWatchLogs.getConfiguredSources().map(({ key }) => key),
      ...(this.queryKind === 'errors'
        ? { query: ERROR_QUERY }
        : {
            queryTemplate: invocationQueryFor(['<requestId>']),
            correlation: 'sourceKey + requestId',
            batchSize: INVOCATION_BATCH_SIZE,
            maxQueries: MAX_INVOCATION_QUERIES,
          }),
    };
  }

  async execute(context: RunbookContext): Promise<StepResult<Rows>> {
    const upstream = this.queryKind === 'invocation' ? readStepOutput<Rows>(context, 'query-lambda-errors') : undefined;
    if (upstream !== undefined && !upstream.ok) return upstream.failure;

    return executeStep('Lambda logs in configured sources', async () => {
      const sources = context.services.cloudWatchLogs.getConfiguredSources();
      if (sources.length === 0) throw new Error('DailyExport requires at least one configured log source');
      const invocationRequestIds =
        upstream === undefined
          ? undefined
          : requestIdsBySource(
              upstream.value,
              sources.map(({ key }) => key),
            );
      if (invocationRequestIds !== undefined && [...invocationRequestIds.values()].every((ids) => ids.length === 0)) {
        return { success: true, output: [], vars: { lambdaInvocationLogCount: '0' } };
      }
      const timeRange = resolveTimeRange(context, { start: 'startTime', end: 'endTime' });
      const results: { rows: Rows; diagnostics?: StepDiagnostics }[] = [];
      let invocationQueryCount = 0;
      for (const source of sources) {
        const requestIds = invocationRequestIds?.get(source.key) ?? [];
        if (this.queryKind === 'invocation' && requestIds.length === 0) continue;
        const cloudWatchLogs = source.service;
        const scopedContext = { ...context, services: { ...context.services, cloudWatchLogs } };
        const queryBatch = async (batch: ReadonlyArray<string> | undefined): Promise<void> => {
          if (batch !== undefined) {
            if (invocationQueryCount >= MAX_INVOCATION_QUERIES) {
              throw new Error(`Lambda invocation query budget exceeded (${String(MAX_INVOCATION_QUERIES)} queries)`);
            }
            invocationQueryCount += 1;
          }
          const query = batch === undefined ? ERROR_QUERY : invocationQueryFor(batch);
          const result = await executeCloudWatchLogsQuery(scopedContext, [LAMBDA_FUNCTION.logGroup], query, timeRange, {
            ...(context.signal === undefined ? {} : { signal: context.signal }),
            paginateResults: true,
          });
          if (batch === undefined && result.rows.length >= QUERY_ROW_LIMIT) {
            const message =
              `Lambda error scan in ${source.key} reached the ` +
              `${String(QUERY_ROW_LIMIT)}-row limit; invocation correlation requires a complete scan`;
            context.services.reporter.add({ label: message });
            throw new Error(message);
          }
          const saturated = batch !== undefined && result.rows.length >= QUERY_ROW_LIMIT;
          // A full batch may omit later request IDs. Keep its diagnostics, then
          // replace its partial rows with the results of narrower queries.
          results.push({
            rows: saturated ? [] : result.rows.map((row) => [...row, { field: 'sourceKey', value: source.key }]),
            ...(result.diagnostics === undefined ? {} : { diagnostics: result.diagnostics }),
          });
          if (saturated && batch !== undefined) {
            if (batch.length === 1) {
              throw new Error(
                `Lambda invocation ${batch[0]} in ${source.key} reached the ${String(QUERY_ROW_LIMIT)}-row limit`,
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
        label: `Log Lambda nelle sorgenti configurate: ${String(rows.length)} righe`,
      });
      return {
        success: true,
        output: rows,
        vars:
          this.queryKind === 'invocation'
            ? { lambdaInvocationLogCount: String(rows.length) }
            : {
                dailyExportSourcesChecked: sources.map(({ key }) => key).join(','),
                dailyExportErrorLogCount: String(rows.length),
              },
        ...(diagnostics === undefined ? {} : { diagnostics }),
      };
    });
  }
}

function requestIdsBySource(rows: Rows, sourceKeys: ReadonlyArray<string>): Map<string, ReadonlyArray<string>> {
  const idsBySource = new Map<string, Set<string>>(sourceKeys.map((key) => [key, new Set<string>()]));
  for (const row of rows) {
    const source = readRowField(row, 'sourceKey') ?? '';
    const ids = idsBySource.get(source);
    if (ids === undefined) {
      throw new Error(`QueryDailyExportAccountsStep: invalid error-row source ${source || '(missing)'}`);
    }
    const requestId =
      (readRowField(row, '@requestId') ?? '').trim() || extractLambdaRequestId(readRowField(row, '@message') ?? '');
    if (requestId === undefined || requestId === '') continue;
    if (!/^[A-Za-z0-9-]{1,128}$/.test(requestId)) {
      throw new Error('QueryDailyExportAccountsStep: invalid Lambda requestId');
    }
    ids.add(requestId);
  }
  return new Map([...idsBySource].map(([source, ids]) => [source, [...ids]]));
}

function invocationQueryFor(requestIds: ReadonlyArray<string>): string {
  const filter = requestIds
    .map((requestId) => `(@requestId = '${requestId}' or @message like '${requestId}')`)
    .join(' or ');
  return `fields @timestamp, @requestId, @message
| filter ${filter}
| sort @timestamp asc
| limit ${QUERY_ROW_LIMIT}`;
}

function mergeDiagnostics(diagnostics: ReadonlyArray<StepDiagnostics | undefined>): StepDiagnostics | undefined {
  const values = diagnostics.flatMap((entry) => (entry?.cloudWatchLogs === undefined ? [] : [entry.cloudWatchLogs]));
  if (values.length === 0 || values.length !== diagnostics.length) return undefined;
  const executions = values.flatMap((value) => value.queryExecutions);
  const statistics = sumCloudWatchLogsQueryStatistics(values.map((value) => value.statistics));
  return {
    cloudWatchLogs: {
      rowsReturned: values.reduce((sum, value) => sum + value.rowsReturned, 0),
      statistics,
      queryExecutions: executions,
    },
  };
}
