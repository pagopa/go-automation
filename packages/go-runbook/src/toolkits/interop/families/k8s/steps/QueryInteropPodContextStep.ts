import { escapeLogsInsightsString, type GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { executeStep } from '../../../../../engine/steps/execution/executeStep.js';
import type { RunbookContext } from '../../../../../engine/types/RunbookContext.js';
import type { Step } from '../../../../../engine/types/Step.js';
import type { StepKind } from '../../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';
import type { OperationalContext } from '../../../../common/services/OperationalContext.js';
import type { OperationalServiceName } from '../../../../common/services/OperationalServiceName.js';
import { executeCloudWatchLogsQuery } from '../../../../common/steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
import { OperationalStep } from '../../../../common/steps/OperationalStep.js';
import { resolveTimeRange } from '../../../../common/time/resolveTimeRange.js';
import type { InteropPodContextCompleteness } from '../types/InteropPodContextCompleteness.js';
import type { QueryInteropPodContextConfig } from '../types/QueryInteropPodContextConfig.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;

/** Maximum rows of a pod context; reaching it means the context is truncated. */
const ROW_LIMIT = 1000;

/**
 * Full log context of the alarmed INTEROP pod, at every level and without a
 * request CID, as Kafka consumers and writers often log (EVO-RBREORG-OPUS-01
 * P30). Replaces six runbook-local copies; each runbook passes its configuration.
 *
 * Reads the resolved `interopLogGroup`, `interopPodApp` and, with a namespace
 * filter, `interopEnvironment`; writes the row count to the configured variable.
 */
export class QueryInteropPodContextStep extends OperationalStep<Rows> implements Step<Rows> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly contextName: string;
  private readonly countVar: string;
  private readonly namespaceSuffix: string | undefined;
  private readonly completeness: InteropPodContextCompleteness;
  private readonly missingContextError: string;
  private readonly incompleteContextError: string;

  /**
   * @param config - Pod context of the runbook
   */
  constructor(config: QueryInteropPodContextConfig) {
    super();
    this.id = config.id;
    this.label = config.label;
    this.contextName = config.contextName;
    this.countVar = config.countVar;
    this.namespaceSuffix = config.namespaceSuffix;
    this.completeness = config.completeness;
    this.missingContextError = config.missingContextError;
    this.incompleteContextError = config.incompleteContextError;
  }

  /**
   * Resolved query target, for the trace.
   *
   * @param context - Runbook context
   * @returns Log group, pod app, environment (with a namespace filter) and levels
   */
  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    return {
      logGroup: context.vars.get('interopLogGroup'),
      podApp: context.vars.get('interopPodApp'),
      ...(this.namespaceSuffix === undefined ? {} : { environment: context.vars.get('interopEnvironment') }),
      levels: 'ALL',
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

  /**
   * Queries the pod context.
   *
   * @param context - Operational context
   * @returns The rows and the count variable, or a failure when the context is missing or incomplete
   */
  override async execute(context: OperationalContext): Promise<StepResult<Rows>> {
    return executeStep(this.contextName, async () => {
      const logGroup = context.vars.get('interopLogGroup')?.trim() ?? '';
      const podApp = context.vars.get('interopPodApp')?.trim() ?? '';
      const environment = context.vars.get('interopEnvironment')?.trim() ?? '';
      if (logGroup === '' || podApp === '' || (this.namespaceSuffix !== undefined && environment === '')) {
        throw new Error(this.missingContextError);
      }
      const result = await executeCloudWatchLogsQuery(
        context,
        [logGroup],
        this.query(podApp, environment),
        resolveTimeRange(context, { start: 'startTime', end: 'endTime' }),
        {
          ...(context.signal === undefined ? {} : { signal: context.signal }),
          logGroupResolutionMode: 'search-configured-profiles',
          paginateResults: true,
        },
      );
      const unreturned = (result.diagnostics?.cloudWatchLogs?.statistics.recordsMatched ?? 0) > result.rows.length;
      if (result.rows.length >= ROW_LIMIT || (this.completeness === 'row-limit-or-unreturned-matches' && unreturned)) {
        throw new Error(this.incompleteContextError);
      }
      return {
        success: true,
        output: result.rows,
        vars: { [this.countVar]: String(result.rows.length) },
        ...(result.diagnostics === undefined ? {} : { diagnostics: result.diagnostics }),
      };
    });
  }

  private query(podApp: string, environment: string): string {
    const namespaced = this.namespaceSuffix !== undefined;
    return [
      `fields @timestamp, pod_app, ${namespaced ? 'pod_namespace, ' : ''}@logStream, stream, log, @message`,
      `| filter pod_app = "${escapeLogsInsightsString(podApp)}"`,
      ...(namespaced
        ? [`| filter pod_namespace = "${escapeLogsInsightsString(environment)}${this.namespaceSuffix}"`]
        : []),
      '| filter @logStream not like /adot-collector/',
      '| sort @timestamp asc',
      `| limit ${String(ROW_LIMIT)}`,
    ].join('\n');
  }
}
