import type { ResultField } from '@go-automation/go-common/aws';

import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';
import type { TimeRangeFromParams } from '../../steps/data/CloudWatchLogsQueryStep.js';
import { resolveTimeRange } from '../../steps/data/resolveTimeRange.js';
import { executeCloudWatchLogsQuery } from '../../steps/data/executeCloudWatchLogsQuery.js';
import { executeStep } from '../../steps/data/executeStep.js';
import { escapeSqlString } from '../../steps/data/interpolateTemplate.js';

const TRACE_ID_PLACEHOLDER = '{{TRACE_ID}}';

export interface QueryServiceTraceLogsConfig {
  readonly id: string;
  readonly label: string;
  readonly serviceName: string;
  readonly varPrefix: string;
  readonly logGroups: ReadonlyArray<string>;
  readonly queryTemplate: string;
  readonly queryProfileId: string;
  readonly timeRangeFromParams: TimeRangeFromParams;
}

export class QueryServiceTraceLogsStep implements Step<ReadonlyArray<ReadonlyArray<ResultField>>> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly serviceName: string;
  private readonly varPrefix: string;
  private readonly logGroups: ReadonlyArray<string>;
  private readonly queryTemplate: string;
  private readonly queryProfileId: string;
  private readonly timeRangeFromParams: TimeRangeFromParams;

  constructor(config: QueryServiceTraceLogsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.serviceName = config.serviceName;
    this.varPrefix = config.varPrefix;
    this.logGroups = config.logGroups;
    this.queryTemplate = config.queryTemplate;
    this.queryProfileId = config.queryProfileId;
    this.timeRangeFromParams = config.timeRangeFromParams;

    if (!this.queryTemplate.includes(TRACE_ID_PLACEHOLDER)) {
      throw new Error(`QueryServiceTraceLogsStep "${this.id}": queryTemplate must contain ${TRACE_ID_PLACEHOLDER}.`);
    }
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    const traceId = this.resolveTraceId(context);
    const startStr = context.params.get(this.timeRangeFromParams.start);
    const endStr = context.params.get(this.timeRangeFromParams.end);
    return {
      queryProfileId: this.queryProfileId,
      queryKind: 'service-trace-log',
      identifierMode: traceId === '' ? 'none' : 'trace',
      query: traceId === '' ? '' : this.buildQuery(traceId),
      logGroups: [...this.logGroups],
      identifiers: { traceId },
      timeRange: { start: startStr ?? null, end: endStr ?? null },
    };
  }

  async execute(context: RunbookContext): Promise<StepResult<ReadonlyArray<ReadonlyArray<ResultField>>>> {
    return executeStep('CloudWatch service trace logs query', async () => {
      const traceId = this.resolveTraceId(context);
      if (traceId === '') {
        context.logger?.text(`      └─ Query trace ${this.serviceName}: skip, trace_id non disponibile`);
        return {
          success: true,
          output: [],
          vars: { [`${this.varPrefix}TraceLogCount`]: '0' },
        };
      }

      context.logger?.text(`      ├─ Query trace ${this.serviceName} [trace_id=${traceId}]`);

      const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
      const query = this.buildQuery(traceId);
      const result = await executeCloudWatchLogsQuery(context, this.logGroups, query, timeRange, {
        ...(context.signal !== undefined ? { signal: context.signal } : {}),
        logGroupResolutionMode: 'search-configured-profiles',
      });

      context.logger?.text(`      └─ Log trace trovati: ${result.rows.length}`);

      return {
        success: true,
        output: result.rows,
        ...(result.diagnostics !== undefined ? { diagnostics: result.diagnostics } : {}),
        vars: { [`${this.varPrefix}TraceLogCount`]: String(result.rows.length) },
      };
    });
  }

  private resolveTraceId(context: RunbookContext): string {
    return (context.vars.get(`${this.varPrefix}TraceId`) ?? '').trim();
  }

  private buildQuery(traceId: string): string {
    return this.queryTemplate.split(TRACE_ID_PLACEHOLDER).join(escapeSqlString(traceId));
  }
}
