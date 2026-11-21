import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { StepKind } from '../../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';
import type { TreeLevelReader } from '../../../../../engine/types/TreeLevelReader.js';
import type { TreeLevelReadResult } from '../../../../../engine/types/TreeLevelReadResult.js';
import type { ReadIdentifier } from '../../../../../engine/types/ReadIdentifier.js';
import { executeCloudWatchLogsQuery } from '../../../../common/steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
import { OperationalStep } from '../../../../common/steps/OperationalStep.js';
import type { OperationalContext } from '../../../../common/services/OperationalContext.js';
import type { OperationalServiceName } from '../../../../common/services/OperationalServiceName.js';
import { renderQueryTemplate } from '../../../../common/queries/renderQueryTemplate.js';
import { resolveTimeRange } from '../../../../common/time/resolveTimeRange.js';
import type { ServiceLogsLevelReaderConfig } from './ServiceLogsLevelReaderConfig.js';
import { traceIdForms } from '../../../../common/parsing/traceIds/traceIdForms.js';
import { serviceRowMatcher } from './serviceLogRows.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;

const FILTER_CLAUSE_PLACEHOLDER = '{{FILTER_CLAUSE}}';

/**
 * The grouped read of the logs of a SEND service: one query for a batch of trace ids, or of fallback UUIDs, combined
 * in `OR`. The engine divides the rows among the parents by identifier; the coverage of the query applies to every
 * identifier of the batch.
 *
 * @example
 * ```typescript
 * const read = new ServiceLogsLevelReader({ id: 'query-pn-delivery', serviceName: 'pn-delivery', ... });
 * ```
 */
export class ServiceLogsLevelReader extends OperationalStep<Rows> implements TreeLevelReader {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly queryTemplate: string;

  /**
   * @param config - Service, log groups and query profile
   * @throws Error when the query has no `{{FILTER_CLAUSE}}`: it would scan the whole log group
   */
  constructor(private readonly config: ServiceLogsLevelReaderConfig) {
    super();
    this.id = config.id;
    this.label = config.label;
    this.queryTemplate = config.queryTemplateOverride ?? config.spec.queryTemplate;
    if (!this.queryTemplate.includes(FILTER_CLAUSE_PLACEHOLDER)) {
      throw new Error(
        `ServiceLogsLevelReader "${this.id}": the query must contain ${FILTER_CLAUSE_PLACEHOLDER}; ` +
          'without it the query would scan the whole log group.',
      );
    }
  }

  /**
   * The query of the read for one sample identifier, with its log groups.
   *
   * @returns Trace metadata of the read
   */
  getTraceInfo(): Readonly<Record<string, unknown>> {
    return {
      queryProfileId: this.config.queryProfileId,
      queryKind: 'service-log',
      identifierMode: 'grouped',
      logGroups: [...this.config.logGroups],
      query: this.buildQuery([{ kind: 'traceId', value: '{{TRACE_ID}}' }]),
    };
  }

  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['cloudWatchLogs'];
  }

  /**
   * A grouped read never runs as a step of a pipeline.
   *
   * @returns A failure
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  override async execute(): Promise<StepResult<Rows>> {
    return { success: false, error: `"${this.id}" is the grouped read of a level: the engine calls read().` };
  }

  /**
   * Reads the logs of the service for a batch of identifiers of the same kind.
   *
   * @param context - Context of the window
   * @param identifiers - Identifiers of the batch
   * @returns The rows, with the coverage of the query
   */
  async read(context: OperationalContext, identifiers: ReadonlyArray<ReadIdentifier>): Promise<TreeLevelReadResult> {
    const query = this.buildQuery(identifiers);
    const result = await executeCloudWatchLogsQuery(
      context,
      this.config.logGroups,
      query,
      resolveTimeRange(context, this.config.timeRangeFromParams),
      {
        ...(context.signal !== undefined ? { signal: context.signal } : {}),
        logGroupResolutionMode: 'search-configured-profiles',
      },
    );
    context.services.reporter.add({
      label: `${this.config.serviceName}: ${String(result.rows.length)} righe per ${String(identifiers.length)} identificatori`,
    });
    return {
      success: true,
      rows: result.rows.filter(serviceRowMatcher(identifiers, this.config.spec.schema)),
      ...(result.coverage.length > 0 ? { coverage: result.coverage } : {}),
      ...(result.diagnostics !== undefined ? { diagnostics: result.diagnostics } : {}),
    };
  }

  /** The query with one predicate per identifier, combined in `OR`. */
  private buildQuery(identifiers: ReadonlyArray<ReadIdentifier>): string {
    // A trace id is looked up in every form the logs write it (X-Ray and compact 32-hex).
    const predicates = identifiers.flatMap((identifier) => {
      const fallback = identifier.kind === 'fallbackUuid';
      const values = fallback ? [identifier.value] : traceIdForms(identifier.value);
      return values.map((value) =>
        renderQueryTemplate(
          fallback ? this.config.spec.fallbackPredicateTemplate : this.config.spec.tracePredicateTemplate,
          {
            values: { '{{VALUE}}': value },
            escape: 'sql',
            queryId: `${this.config.queryProfileId}.serviceLog.${fallback ? 'fallback' : 'trace'}Predicate`,
          },
        ),
      );
    });
    return renderQueryTemplate(this.queryTemplate, {
      values: { [FILTER_CLAUSE_PLACEHOLDER]: `filter ${predicates.map((predicate) => `(${predicate})`).join(' or ')}` },
      escape: 'none',
      queryId: `${this.config.queryProfileId}.serviceLog`,
    });
  }
}
