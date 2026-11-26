import { getErrorMessage } from '@pagopa/go-common/errors';
import { readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { EvidenceIdentifier, RunbookContext, Step, StepKind, StepResult } from '../../../../../engine/index.js';
import { executeStep } from '../../../../../engine/index.js';
import type { TimeRangeFromParams } from '../../../../common/time/TimeRangeFromParams.js';
import { resolveTimeRange } from '../../../../common/time/resolveTimeRange.js';
import { executeCloudWatchLogsQuery } from '../../../../common/steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
import { SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS } from '../../../../common/steps/aws/cloudwatch-logs/SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS.js';
import type { ExecutedCloudWatchLogsQuery } from '../../../../common/steps/aws/cloudwatch-logs/ExecutedCloudWatchLogsQuery.js';
import { ApiGwReporter } from '../../../../common/families/apigw/reporting/ApiGwReporter.js';
import { SEND_API_GW_PROFILE } from '../profiles/SEND_API_GW_PROFILE.js';
import { rowsOfTraces } from '../../../../common/parsing/traceIds/traceRows.js';
import { renderServiceLogQuery, SERVICE_LOG_FILTER_CLAUSE } from '../queries/renderServiceLogQuery.js';
import { OperationalStep } from '../../../../common/steps/OperationalStep.js';
import type { OperationalContext } from '../../../../common/services/OperationalContext.js';
import type { OperationalServiceName } from '../../../../common/services/OperationalServiceName.js';
import type { CloudWatchLogsRows } from '../../../../common/steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';

/**
 * Configuration for {@link QueryServiceLogsStep}.
 */
export interface QueryServiceLogsConfig {
  readonly id: string;
  readonly label: string;
  readonly logGroups: ReadonlyArray<string>;
  readonly timeRangeFromParams: TimeRangeFromParams;
  readonly queryTemplateOverride?: string;
}

/**
 * Reads the logs of a SEND service for the request of the window: by its fallback UUID when there is one, otherwise
 * by its trace id, in every form the logs write it, keeping only the rows of that trace.
 *
 * @example
 * ```typescript
 * const step = new QueryServiceLogsStep({
 *   id: 'query-completion',
 *   label: 'Completion of the request',
 *   logGroups: ['/aws/ecs/pn-national-registries'],
 *   timeRangeFromParams: ALARM_TIME_RANGE,
 * });
 * ```
 */
export class QueryServiceLogsStep extends OperationalStep<CloudWatchLogsRows> implements Step<CloudWatchLogsRows> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly queryTemplate: string;

  /**
   * @param config - Log groups and query of the service
   * @throws Error when the query has no `{{FILTER_CLAUSE}}`: it would scan the whole log group
   */
  constructor(private readonly config: QueryServiceLogsConfig) {
    super();
    this.id = config.id;
    this.label = config.label;
    this.queryTemplate = config.queryTemplateOverride ?? SEND_API_GW_PROFILE.serviceLog.queryTemplate;
    if (!this.queryTemplate.includes(SERVICE_LOG_FILTER_CLAUSE)) {
      throw new Error(
        `QueryServiceLogsStep "${this.id}": queryTemplate must contain the ${SERVICE_LOG_FILTER_CLAUSE} placeholder; ` +
          'without it the query would scan the whole log group.',
      );
    }
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    const identifier = identifierOf(context);
    return {
      queryProfileId: SEND_API_GW_PROFILE.id,
      queryKind: 'service-log',
      identifierMode: identifier?.kind ?? 'none',
      ...(identifier !== undefined ? { query: this.buildQuery(identifier) } : {}),
      logGroups: [...this.config.logGroups],
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

  override async execute(context: OperationalContext): Promise<StepResult<CloudWatchLogsRows>> {
    return executeStep(context, 'CloudWatch service logs query', async () => {
      const identifier = identifierOf(context);
      if (identifier === undefined) {
        // The request cannot be followed into the service: the read is skipped, not empty.
        return {
          success: true,
          output: [],
          coverage: [
            {
              source: this.config.logGroups.join(', '),
              complete: false,
              reason: 'skipped',
              detail: 'trace id e fallback mancanti',
            },
          ],
        };
      }

      let result: ExecutedCloudWatchLogsQuery;
      try {
        result = await executeCloudWatchLogsQuery(
          context,
          this.config.logGroups,
          this.buildQuery(identifier),
          resolveTimeRange(context, this.config.timeRangeFromParams),
          SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS,
        );
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        new ApiGwReporter(context.services.reporter).queryFailed(this.config.logGroups, message);
        throw error;
      }

      const { traceIdField } = SEND_API_GW_PROFILE.serviceLog.schema;
      return {
        success: true,
        output: rowsOfTraces(
          result.rows,
          [identifier],
          (row) => readRowField(row, traceIdField) ?? readRowField(row, `@${traceIdField}`) ?? '',
        ),
        ...(result.diagnostics !== undefined ? { diagnostics: result.diagnostics } : {}),
        ...(result.coverage.length > 0 ? { coverage: result.coverage } : {}),
      };
    });
  }

  private buildQuery(identifier: EvidenceIdentifier): string {
    return renderServiceLogQuery(
      SEND_API_GW_PROFILE.serviceLog,
      SEND_API_GW_PROFILE.id,
      [identifier],
      this.queryTemplate,
    );
  }
}

/** The identifier of the request: its fallback UUID when there is one, otherwise its trace id. */
function identifierOf(context: RunbookContext): EvidenceIdentifier | undefined {
  const fallback = (context.vars.get('fallbackUuid') ?? '').trim();
  if (fallback !== '') return { kind: 'fallbackUuid', value: fallback };
  const traceId = (context.vars.get(SEND_API_GW_PROFILE.accessLog.schema.traceIdContextVar) ?? '').trim();
  return traceId !== '' ? { kind: 'traceId', value: traceId } : undefined;
}
