import type {
  EvidenceIdentifier,
  StepKind,
  TreeLevelReadResult,
  TreeLevelReader,
  TreeLevelRowRules,
} from '../../../engine/index.js';
import type { OperationalContext } from '../services/OperationalContext.js';
import type { OperationalServiceName } from '../services/OperationalServiceName.js';
import { readCloudWatchLogsBatches } from '../steps/aws/cloudwatch-logs/readCloudWatchLogsBatches.js';
import type { CloudWatchLogsRow } from '../steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';
import { SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS } from '../steps/aws/cloudwatch-logs/SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS.js';
import { resolveTimeRange } from '../time/resolveTimeRange.js';
import type { CloudWatchLogsLevelReaderConfig } from './CloudWatchLogsLevelReaderConfig.js';
import type { CloudWatchLogsRows } from '../steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';
import { queryBatches } from '../steps/aws/cloudwatch-logs/queryBatches.js';

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

  /** Batches as long as the query allows: every query scans the whole log group of the window. */
  batches(
    identifiers: ReadonlyArray<EvidenceIdentifier>,
    maxIdentifiers?: number,
  ): ReadonlyArray<ReadonlyArray<EvidenceIdentifier>> {
    return queryBatches(identifiers, (batch) => this.query(batch), maxIdentifiers);
  }

  /**
   * Reads a batch of identifiers with one query. A saturated batch is divided and read again, within the budget of the
   * execution, when the level tells the identifier and the identity of a row.
   *
   * @param context - Context of the window
   * @param identifiers - Identifiers of the batch, of the same kind
   * @param rules - The rules of the rows of the level
   * @returns The rows of the batch, with the coverage and the diagnostics of its queries
   */
  async read(
    context: OperationalContext,
    identifiers: ReadonlyArray<EvidenceIdentifier>,
    rules: TreeLevelRowRules = {},
  ): Promise<TreeLevelReadResult> {
    // The read opens its own section, so the statistics of its queries are reported under it.
    context.services.reporter.section(this.label);
    const { attribute, rowIdentity } = rules;
    // The matcher of each identifier is built once, not for every row the division looks at.
    const matchers = new Map(identifiers.map((identifier) => [identifier, attribute?.(identifier)]));
    const read = await readCloudWatchLogsBatches(context, {
      logGroups: this.logGroups(),
      timeRange: resolveTimeRange(context, this.config.timeRangeFromParams),
      options: SEARCH_CONFIGURED_PROFILES_QUERY_OPTIONS,
      items: identifiers,
      batchSize: identifiers.length,
      query: (batch) => this.query(batch),
      identifier: (identifier) => identifier,
      ...(attribute !== undefined && rowIdentity !== undefined
        ? {
            belongs: (row: CloudWatchLogsRow, identifier: EvidenceIdentifier) =>
              matchers.get(identifier)?.(row) ?? false,
            rowIdentity,
          }
        : {}),
    });
    this.report(context, read.rows.length, identifiers);
    return {
      success: true,
      rows: this.rowsOf(read.rows, identifiers),
      ...(read.coverage.length > 0 ? { coverage: read.coverage } : {}),
      ...(read.diagnostics !== undefined ? { diagnostics: read.diagnostics } : {}),
    };
  }

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
