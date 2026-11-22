import type { EvidenceIdentifier, StepKind, TreeLevelReadResult, TreeLevelReader } from '../../../engine/index.js';
import type { OperationalContext } from '../services/OperationalContext.js';
import type { OperationalServiceName } from '../services/OperationalServiceName.js';
import { executeCloudWatchLogsQuery } from '../steps/aws/cloudwatch-logs/executeCloudWatchLogsQuery.js';
import { SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS } from '../steps/aws/cloudwatch-logs/SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS.js';
import { resolveTimeRange } from '../time/resolveTimeRange.js';
import type { CloudWatchLogsLevelReaderConfig } from './CloudWatchLogsLevelReaderConfig.js';
import type { CloudWatchLogsRows } from '../steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';

/**
 * Base of the grouped reads of a level in CloudWatch Logs: one Logs Insights query for a batch of identifiers, in the
 * time range of the configured parameters, searched in the configured profiles. A subclass gives the log groups, the
 * query of a batch, the rows that belong to the batch and the line of the narrative; the coverage and the diagnostics
 * of the query reach the engine unchanged.
 *
 * @typeParam TConfig - Configuration of the read
 *
 * @example
 * ```typescript
 * class MessageLevelReader extends CloudWatchLogsLevelReader<MessageLevelReaderConfig> {
 *   constructor(config: MessageLevelReaderConfig) {
 *     super(config);
 *   }
 *   protected logGroups(): ReadonlyArray<string> {
 *     return [this.config.logGroup];
 *   }
 *   // query, rowsOf, report …
 * }
 * ```
 */
export abstract class CloudWatchLogsLevelReader<
  TConfig extends CloudWatchLogsLevelReaderConfig,
> implements TreeLevelReader {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  /**
   * @param config - Identity, time range and the configuration of the subclass
   */
  constructor(protected readonly config: TConfig) {
    this.id = config.id;
    this.label = config.label;
  }

  /**
   * Operational services the read uses.
   *
   * @returns The required service names
   */
  requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['cloudWatchLogs'];
  }

  /**
   * Reads a batch of identifiers with one query.
   *
   * @param context - Context of the window
   * @param identifiers - Identifiers of the batch, of the same kind
   * @returns The rows of the batch, with the coverage and the diagnostics of the query
   */
  async read(
    context: OperationalContext,
    identifiers: ReadonlyArray<EvidenceIdentifier>,
  ): Promise<TreeLevelReadResult> {
    const result = await executeCloudWatchLogsQuery(
      context,
      this.logGroups(),
      this.query(identifiers),
      resolveTimeRange(context, this.config.timeRangeFromParams),
      SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS,
    );
    this.report(context, result.rows.length, identifiers);
    return {
      success: true,
      rows: this.rowsOf(result.rows, identifiers),
      ...(result.coverage.length > 0 ? { coverage: result.coverage } : {}),
      ...(result.diagnostics !== undefined ? { diagnostics: result.diagnostics } : {}),
    };
  }

  /** The log groups the query reads. */
  protected abstract logGroups(): ReadonlyArray<string>;

  /** The query of a batch of identifiers. */
  protected abstract query(identifiers: ReadonlyArray<EvidenceIdentifier>): string;

  /** The rows of the query that belong to the identifiers of the batch. */
  protected abstract rowsOf(
    rows: CloudWatchLogsRows,
    identifiers: ReadonlyArray<EvidenceIdentifier>,
  ): CloudWatchLogsRows;

  /** The narrative line of a read that answered. */
  protected abstract report(
    context: OperationalContext,
    rowCount: number,
    identifiers: ReadonlyArray<EvidenceIdentifier>,
  ): void;
}
