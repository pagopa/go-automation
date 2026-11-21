import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { escapeSqlString } from '../../../queries/interpolateTemplate.js';

import type { StepKind } from '../../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';
import type { TreeLevelReader } from '../../../../../engine/types/TreeLevelReader.js';
import type { TreeLevelReadResult } from '../../../../../engine/types/TreeLevelReadResult.js';
import type { ReadIdentifier } from '../../../../../engine/types/ReadIdentifier.js';
import { executeCloudWatchLogsQuery } from '../../../steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
import { OperationalStep } from '../../../steps/OperationalStep.js';
import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { OperationalServiceName } from '../../../services/OperationalServiceName.js';
import { resolveTimeRange } from '../../../time/resolveTimeRange.js';
import type { ServiceTraceLevelReaderConfig } from './ServiceTraceLevelReaderConfig.js';
import { traceIdForms } from '../../../parsing/traceIds/traceIdForms.js';
import { readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { rowsOfTraces } from '../../../parsing/traceIds/rowsOfTraces.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;

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
export class ServiceTraceLevelReader extends OperationalStep<Rows> implements TreeLevelReader {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  /**
   * @param config - Service, log groups and trace query
   * @throws Error when the query has no `{{TRACE_ID}}`
   */
  constructor(private readonly config: ServiceTraceLevelReaderConfig) {
    super();
    this.id = config.id;
    this.label = config.label;
    if (!config.queryTemplate.includes(TRACE_ID_PLACEHOLDER)) {
      throw new Error(`ServiceTraceLevelReader "${this.id}": queryTemplate must contain ${TRACE_ID_PLACEHOLDER}.`);
    }
  }

  getTraceInfo(): Readonly<Record<string, unknown>> {
    return {
      queryProfileId: this.config.queryProfileId,
      queryKind: 'service-trace-log',
      logGroups: [...this.config.logGroups],
      query: this.buildQuery(['1-00000000-000000000000000000000000']),
    };
  }

  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['cloudWatchLogs'];
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  override async execute(): Promise<StepResult<Rows>> {
    return { success: false, error: `"${this.id}" is the grouped read of a level: the engine calls read().` };
  }

  /**
   * Reads the trace of a batch of trace ids.
   *
   * @param context - Context of the window
   * @param identifiers - Trace ids of the batch
   * @returns The rows, with the coverage of the query
   */
  async read(context: OperationalContext, identifiers: ReadonlyArray<ReadIdentifier>): Promise<TreeLevelReadResult> {
    const result = await executeCloudWatchLogsQuery(
      context,
      this.config.logGroups,
      this.buildQuery(identifiers.map(({ value }) => value)),
      resolveTimeRange(context, this.config.timeRangeFromParams),
      {
        ...(context.signal !== undefined ? { signal: context.signal } : {}),
        logGroupResolutionMode: 'search-configured-profiles',
      },
    );
    context.services.reporter.add({
      label: `Trace ${this.config.serviceName}: ${String(result.rows.length)} righe per ${String(identifiers.length)} trace id`,
    });
    return {
      success: true,
      rows: rowsOfTraces(result.rows, identifiers, (row) => readRowField(row, 'trace_id') ?? ''),
      ...(result.coverage.length > 0 ? { coverage: result.coverage } : {}),
      ...(result.diagnostics !== undefined ? { diagnostics: result.diagnostics } : {}),
    };
  }

  private buildQuery(traceIds: ReadonlyArray<string>): string {
    const { queryTemplate } = this.config;
    if (!readsTraceBatches(queryTemplate)) {
      return queryTemplate.split(TRACE_ID_PLACEHOLDER).join(escapeSqlString(traceIds[0] ?? ''));
    }
    // Every trace id in every form the logs write it (X-Ray and compact 32-hex).
    const predicate = traceIds
      .flatMap((traceId) => traceIdForms(traceId))
      .map((form) => `@message like '${escapeSqlString(form)}'`)
      .join(' or ');
    return queryTemplate.split(TRACE_PREDICATE).join(`(${predicate})`);
  }
}
