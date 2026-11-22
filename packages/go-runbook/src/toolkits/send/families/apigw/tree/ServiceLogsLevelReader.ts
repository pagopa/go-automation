import type { EvidenceIdentifier } from '../../../../../engine/index.js';
import type { OperationalContext } from '../../../../common/services/OperationalContext.js';
import { CloudWatchLogsLevelReader } from '../../../../common/tree/CloudWatchLogsLevelReader.js';
import type { ServiceLogsLevelReaderConfig } from './ServiceLogsLevelReaderConfig.js';
import { serviceRowMatcher } from './serviceLogRows.js';
import { renderServiceLogQuery, SERVICE_LOG_FILTER_CLAUSE } from '../queries/renderServiceLogQuery.js';
import type { CloudWatchLogsRows } from '../../../../common/steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';

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
export class ServiceLogsLevelReader extends CloudWatchLogsLevelReader<ServiceLogsLevelReaderConfig> {
  private readonly queryTemplate: string;

  /**
   * @param config - Service, log groups and query profile
   * @throws Error when the query has no `{{FILTER_CLAUSE}}`: it would scan the whole log group
   */
  constructor(config: ServiceLogsLevelReaderConfig) {
    super(config);
    this.queryTemplate = config.queryTemplateOverride ?? config.spec.queryTemplate;
    if (!this.queryTemplate.includes(SERVICE_LOG_FILTER_CLAUSE)) {
      throw new Error(
        `ServiceLogsLevelReader "${this.id}": the query must contain ${SERVICE_LOG_FILTER_CLAUSE}; ` +
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
      query: this.query([{ kind: 'traceId', value: '{{TRACE_ID}}' }]),
    };
  }

  protected override logGroups(): ReadonlyArray<string> {
    return this.config.logGroups;
  }

  /** The query with one predicate per identifier, combined in `OR`. */
  protected override query(identifiers: ReadonlyArray<EvidenceIdentifier>): string {
    return renderServiceLogQuery(this.config.spec, this.config.queryProfileId, identifiers, this.queryTemplate);
  }

  protected override rowsOf(
    rows: CloudWatchLogsRows,
    identifiers: ReadonlyArray<EvidenceIdentifier>,
  ): CloudWatchLogsRows {
    return rows.filter(serviceRowMatcher(identifiers, this.config.spec.schema));
  }

  protected override report(
    context: OperationalContext,
    rowCount: number,
    identifiers: ReadonlyArray<EvidenceIdentifier>,
  ): void {
    context.services.reporter.add({
      label: `${this.config.serviceName}: ${String(rowCount)} righe per ${String(identifiers.length)} identificatori`,
    });
  }
}
