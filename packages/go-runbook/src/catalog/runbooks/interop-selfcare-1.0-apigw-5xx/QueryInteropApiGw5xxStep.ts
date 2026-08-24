import type {
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
  ResultField,
} from '@go-automation/go-common/aws';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepKind } from '../../../types/StepKind.js';
import type { StepResult } from '../../../types/StepResult.js';
import type { StepDiagnostics } from '../../../trace/StepDiagnostics.js';
import type { TimeRangeFromParams } from '../../../steps/data/TimeRangeFromParams.js';
import { resolveTimeRange } from '../../../steps/data/resolveTimeRange.js';

import { apigw } from '../framework.js';

import { buildInteropApiGw5xxAggregateQuery, INTEROP_API_GW_5XX_QUERY_PROFILE_ID } from './queries.js';

export interface QueryInteropApiGw5xxStepConfig {
  readonly id: string;
  readonly label: string;
  readonly timeRangeFromParams: TimeRangeFromParams;
  readonly apiGwIdVar?: string;
  readonly logGroupVar?: string;
}

const DEFAULT_API_GW_ID_VAR = 'interopApiGwId';
const DEFAULT_LOG_GROUP_VAR = 'interopApiGwLogGroup';

export class QueryInteropApiGw5xxStep implements Step<ReadonlyArray<ReadonlyArray<ResultField>>> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly timeRangeFromParams: TimeRangeFromParams;
  private readonly apiGwIdVar: string;
  private readonly logGroupVar: string;

  constructor(config: QueryInteropApiGw5xxStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.timeRangeFromParams = config.timeRangeFromParams;
    this.apiGwIdVar = config.apiGwIdVar ?? DEFAULT_API_GW_ID_VAR;
    this.logGroupVar = config.logGroupVar ?? DEFAULT_LOG_GROUP_VAR;
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    const apiGwId = context.vars.get(this.apiGwIdVar);
    const logGroup = context.vars.get(this.logGroupVar);
    return {
      queryProfileId: INTEROP_API_GW_5XX_QUERY_PROFILE_ID,
      queryKind: 'interop-api-gateway-5xx-aggregate',
      identifierMode: 'api-gateway-id',
      identifiers: { apiGwId: apiGwId ?? null },
      query: apiGwId === undefined ? '' : buildInteropApiGw5xxAggregateQuery(apiGwId),
      logGroups: logGroup === undefined ? [] : [logGroup],
      timeRange: {
        start: context.params.get(this.timeRangeFromParams.start) ?? null,
        end: context.params.get(this.timeRangeFromParams.end) ?? null,
      },
    };
  }

  async execute(context: RunbookContext): Promise<StepResult<ReadonlyArray<ReadonlyArray<ResultField>>>> {
    const apiGwId = readRequiredVar(context, this.apiGwIdVar);
    if (apiGwId === undefined) return missingVarFailure(this.apiGwIdVar);
    const logGroup = readRequiredVar(context, this.logGroupVar);
    if (logGroup === undefined) return missingVarFailure(this.logGroupVar);

    const query = buildInteropApiGw5xxAggregateQuery(apiGwId);
    const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
    context.logger?.text(`      ├─ Query access log API Gateway INTEROP [apigwId=${apiGwId}]`);
    const result = await context.services.cloudWatchLogs.queryWithStatistics(
      [logGroup],
      query,
      timeRange,
      buildQueryOptions(context),
    );
    context.logger?.text(`      └─ Aggregati 5xx trovati: ${result.rows.length}`);

    return {
      success: true,
      output: enrichAggregateRows(result.rows),
      diagnostics: toStepDiagnostics(result),
    };
  }
}

/** Adds the canonical message/timestamp aliases consumed by the generic APIGW output builder. */
function enrichAggregateRows(
  rows: ReadonlyArray<ReadonlyArray<ResultField>>,
): ReadonlyArray<ReadonlyArray<ResultField>> {
  return rows.map((row) => {
    const additions: ResultField[] = [];
    if (apigw.extractCwField(row, '@timestamp') === undefined) {
      const latestTimestamp = apigw.extractCwField(row, 'latestTimestamp');
      if (latestTimestamp !== undefined) additions.push({ field: '@timestamp', value: latestTimestamp });
    }
    if (apigw.extractCwField(row, '@message') === undefined && apigw.extractCwField(row, 'message') === undefined) {
      const message = buildAggregateMessage(row);
      if (message !== undefined) additions.push({ field: 'message', value: message });
    }
    return additions.length === 0 ? row : [...row, ...additions];
  });
}

function buildAggregateMessage(row: ReadonlyArray<ResultField>): string | undefined {
  const sourceIp = apigw.extractCwField(row, 'sourceIp');
  const parts = [
    'API Gateway',
    apigw.extractCwField(row, 'status'),
    apigw.extractCwField(row, 'httpMethod'),
    apigw.extractCwField(row, 'requestPath'),
    apigw.extractCwField(row, 'integrationError'),
    sourceIp === undefined ? undefined : `sourceIp=${sourceIp}`,
  ].filter((part): part is string => part !== undefined && part.trim() !== '' && part !== '-');
  return parts.length === 1 ? undefined : parts.join(' ');
}

function readRequiredVar(context: RunbookContext, key: string): string | undefined {
  const value = context.vars.get(key)?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function missingVarFailure(key: string): StepResult<never> {
  return { success: false, error: `Missing required runbook variable: ${key}` };
}

function buildQueryOptions(context: RunbookContext): AWSCloudWatchLogsQueryOptions {
  return {
    ...(context.signal === undefined ? {} : { signal: context.signal }),
    logGroupResolutionMode: 'search-configured-profiles',
  };
}

function toStepDiagnostics(result: AWSCloudWatchLogsQueryResult): StepDiagnostics {
  return {
    cloudWatchLogs: {
      rowsReturned: result.rows.length,
      statistics: result.statistics,
      queryExecutions: result.queryExecutions,
    },
  };
}
