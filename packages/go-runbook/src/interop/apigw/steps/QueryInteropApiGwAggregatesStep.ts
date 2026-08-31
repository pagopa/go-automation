import { readRowField } from '@go-automation/go-common/aws';
import type {
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
  ResultField,
} from '@go-automation/go-common/aws';
import { resolveTimeRange } from '../../../steps/data/resolveTimeRange.js';
import type { TimeRangeFromParams } from '../../../steps/data/TimeRangeFromParams.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepKind } from '../../../types/StepKind.js';
import type { StepResult } from '../../../types/StepResult.js';
import type { StepDiagnostics } from '../../../trace/StepDiagnostics.js';
import { normalizeInteropApiGwAggregateValue } from '../helpers/normalizeInteropApiGwAggregateValue.js';

export type BuildInteropApiGwAggregateQueryFn = (apiGwId: string) => string;

export interface QueryInteropApiGwAggregatesStepConfig {
  readonly id: string;
  readonly label: string;
  readonly timeRangeFromParams: TimeRangeFromParams;
  readonly queryProfileId: string;
  readonly queryKind: string;
  readonly errorFamilyLabel: string;
  readonly buildQuery: BuildInteropApiGwAggregateQueryFn;
  readonly apiGwIdVar?: string;
  readonly logGroupVar?: string;
}

const DEFAULT_API_GW_ID_VAR = 'interopApiGwId';
const DEFAULT_LOG_GROUP_VAR = 'interopApiGwLogGroup';

export class QueryInteropApiGwAggregatesStep implements Step<ReadonlyArray<ReadonlyArray<ResultField>>> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly timeRangeFromParams: TimeRangeFromParams;
  private readonly queryProfileId: string;
  private readonly queryKind: string;
  private readonly errorFamilyLabel: string;
  private readonly buildQuery: BuildInteropApiGwAggregateQueryFn;
  private readonly apiGwIdVar: string;
  private readonly logGroupVar: string;

  constructor(config: QueryInteropApiGwAggregatesStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.timeRangeFromParams = { ...config.timeRangeFromParams };
    this.queryProfileId = config.queryProfileId;
    this.queryKind = config.queryKind;
    this.errorFamilyLabel = config.errorFamilyLabel;
    this.buildQuery = config.buildQuery;
    this.apiGwIdVar = config.apiGwIdVar ?? DEFAULT_API_GW_ID_VAR;
    this.logGroupVar = config.logGroupVar ?? DEFAULT_LOG_GROUP_VAR;
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    const apiGwId = context.vars.get(this.apiGwIdVar);
    const logGroup = context.vars.get(this.logGroupVar);
    return {
      queryProfileId: this.queryProfileId,
      queryKind: this.queryKind,
      identifierMode: 'api-gateway-id',
      identifiers: { apiGwId: apiGwId ?? null },
      query: apiGwId === undefined ? '' : this.buildQuery(apiGwId),
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

    const query = this.buildQuery(apiGwId);
    const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
    context.logger?.text(`  ├─ Query access log API Gateway INTEROP [apigwId=${apiGwId}]`);
    const result = await context.services.cloudWatchLogs.queryWithStatistics(
      [logGroup],
      query,
      timeRange,
      buildQueryOptions(context),
    );
    context.logger?.text(`  └─ Aggregati ${this.errorFamilyLabel} trovati: ${result.rows.length}`);

    return {
      success: true,
      output: enrichAggregateRows(result.rows),
      diagnostics: toStepDiagnostics(result),
    };
  }
}

function enrichAggregateRows(
  rows: ReadonlyArray<ReadonlyArray<ResultField>>,
): ReadonlyArray<ReadonlyArray<ResultField>> {
  return rows.map((row) => {
    const additions: ResultField[] = [];
    if (readRowField(row, '@timestamp') === undefined) {
      const latestTimestamp = readRowField(row, 'latestTimestamp');
      if (latestTimestamp !== undefined) additions.push({ field: '@timestamp', value: latestTimestamp });
    }
    if (readRowField(row, '@message') === undefined && readRowField(row, 'message') === undefined) {
      const message = buildAggregateMessage(row);
      if (message !== undefined) additions.push({ field: 'message', value: message });
    }
    return additions.length === 0 ? row : [...row, ...additions];
  });
}

function buildAggregateMessage(row: ReadonlyArray<ResultField>): string | undefined {
  const readNormalized = (field: string): string | undefined =>
    normalizeInteropApiGwAggregateValue(readRowField(row, field));
  const sourceIp = readNormalized('sourceIp');
  const parts = [
    'API Gateway',
    readNormalized('status'),
    readNormalized('httpMethod'),
    readNormalized('requestPath'),
    readNormalized('integrationError'),
    sourceIp === undefined ? undefined : `sourceIp=${sourceIp}`,
  ].filter((part): part is string => part !== undefined);
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
