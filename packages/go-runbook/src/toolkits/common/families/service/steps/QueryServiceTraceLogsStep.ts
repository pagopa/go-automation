import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { Step } from '../../../../../engine/types/Step.js';
import type { StepKind } from '../../../../../engine/types/StepKind.js';
import type { RunbookContext } from '../../../../../engine/types/RunbookContext.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';
import type { TimeRangeFromParams } from '../../../time/TimeRangeFromParams.js';
import { resolveTimeRange } from '../../../time/resolveTimeRange.js';
import { executeCloudWatchLogsQuery } from '../../../steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
import { executeStep } from '../../../../../engine/steps/execution/executeStep.js';
import { escapeSqlString } from '../../../queries/interpolateTemplate.js';
import { OperationalStep } from '../../../steps/OperationalStep.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { OperationalServiceName } from '../../../services/OperationalServiceName.js';

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

export class QueryServiceTraceLogsStep
  extends OperationalStep<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>>
  implements Step<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>>
{
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
    super();
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

  /**
   * Operational services this step uses.
   *
   * @returns The required service names
   */
  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['cloudWatchLogs'];
  }

  override async execute(
    context: OperationalContext,
  ): Promise<StepResult<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>>> {
    return executeStep('CloudWatch service trace logs query', async () => {
      const traceId = this.resolveTraceId(context);
      if (traceId === '') {
        context.services.reporter.add({ label: `Query trace ${this.serviceName}: skip, trace_id non disponibile` });
        return {
          success: true,
          output: [],
          vars: { [`${this.varPrefix}TraceLogCount`]: '0' },
        };
      }

      context.services.reporter.add({ label: `Query trace ${this.serviceName} [trace_id=${traceId}]` });

      const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
      const query = this.buildQuery(traceId);
      const result = await executeCloudWatchLogsQuery(context, this.logGroups, query, timeRange, {
        ...(context.signal !== undefined ? { signal: context.signal } : {}),
        logGroupResolutionMode: 'search-configured-profiles',
      });

      context.services.reporter.add({ label: `Log trace trovati: ${result.rows.length}` });

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
