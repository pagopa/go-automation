import { readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { EvidenceIdentifier } from '../../../../../engine/index.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import { renderQueryTemplate } from '../../../queries/renderQueryTemplate.js';
import { escapeSqlString } from '../../../queries/interpolateTemplate.js';
import { CloudWatchLogsLevelReader } from '../../../tree/CloudWatchLogsLevelReader.js';
import type { ServiceTraceLevelReaderConfig } from './ServiceTraceLevelReaderConfig.js';
import { traceIdForms } from '../../../parsing/traceIds/traceIdentity.js';
import { rowsOfTraces } from '../../../parsing/traceIds/traceRows.js';
import { traceRowMatcher } from '../../../parsing/traceIds/traceRows.js';
import type { CloudWatchLogsRow } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';
import type { CloudWatchLogsRows } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';

const TRACE_ID_PLACEHOLDER = '{{TRACE_ID}}';

/** The predicate a trace query repeats, once per trace id, to read a batch. */
const TRACE_PREDICATE = `@message like '${TRACE_ID_PLACEHOLDER}'`;

/**
 * Whether a trace query can read a batch of trace ids: it filters with `@message like '{{TRACE_ID}}'`.
 *
 * @param template - Trace query
 * @returns `true` when the predicate can be repeated in `OR`
 */
export function readsTraceBatches(template: string): boolean {
  return template.includes(TRACE_PREDICATE);
}

/**
 * The grouped read of the trace of the errors of a service: the trace ids of a batch in `OR`.
 */
export class ServiceTraceLevelReader extends CloudWatchLogsLevelReader<ServiceTraceLevelReaderConfig> {
  /**
   * @param config - Service, log groups and trace query
   * @throws Error when the query has no `{{TRACE_ID}}`
   */
  constructor(config: ServiceTraceLevelReaderConfig) {
    super(config);
    if (!config.queryTemplate.includes(TRACE_ID_PLACEHOLDER)) {
      throw new Error(`ServiceTraceLevelReader "${this.id}": queryTemplate must contain ${TRACE_ID_PLACEHOLDER}.`);
    }
  }

  /**
   * The query of the read for one sample trace id, with its log groups.
   *
   * @returns Trace metadata of the read
   */
  getTraceInfo(): Readonly<Record<string, unknown>> {
    return {
      queryProfileId: this.config.queryProfileId,
      queryKind: 'service-trace-log',
      logGroups: [...this.config.logGroups],
      query: this.query([{ kind: 'traceId', value: '1-00000000-000000000000000000000000' }]),
    };
  }

  protected override logGroups(): ReadonlyArray<string> {
    return this.config.logGroups;
  }

  protected override query(identifiers: ReadonlyArray<EvidenceIdentifier>): string {
    const { queryTemplate } = this.config;
    if (!readsTraceBatches(queryTemplate)) {
      return renderQueryTemplate(queryTemplate, {
        values: { [TRACE_ID_PLACEHOLDER]: identifiers[0]?.value ?? '' },
        escape: 'sql',
        queryId: this.config.queryProfileId,
      });
    }
    // Every trace id in every form the logs write it (X-Ray and compact 32-hex).
    const predicate = identifiers
      .flatMap(({ value }) => traceIdForms(value))
      .map((form) => `@message like '${escapeSqlString(form)}'`)
      .join(' or ');
    return renderQueryTemplate(queryTemplate, {
      values: { [TRACE_PREDICATE]: `(${predicate})` },
      queryId: this.config.queryProfileId,
    });
  }

  /**
   * The rows of the batch: a read by batches follows the rule its attribution uses; a query that reads one trace at
   * a time drops only the rows whose trace field names another trace.
   */
  protected override rowsOf(
    rows: CloudWatchLogsRows,
    identifiers: ReadonlyArray<EvidenceIdentifier>,
  ): CloudWatchLogsRows {
    const traceField = (row: CloudWatchLogsRow): string => readRowField(row, 'trace_id') ?? '';
    if (!readsTraceBatches(this.config.queryTemplate)) return rowsOfTraces(rows, identifiers, traceField);
    const belongs = traceRowMatcher(identifiers.map((identifier) => identifier.value));
    return rows.filter((row) => belongs(traceField(row), readRowField(row, '@message') ?? ''));
  }

  protected override report(
    context: OperationalContext,
    rowCount: number,
    identifiers: ReadonlyArray<EvidenceIdentifier>,
  ): void {
    context.services.reporter.add({
      label: `Trace ${this.config.serviceName}: ${String(rowCount)} righe per ${String(identifiers.length)} trace id`,
    });
  }
}
