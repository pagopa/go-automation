import type { EvidenceIdentifier } from '../../../../../engine/index.js';
import type { CloudWatchLogsRead } from './CloudWatchLogsRead.js';
import type { CloudWatchLogsRow } from './CloudWatchLogsRow.js';
import type { CloudWatchLogsRows } from './CloudWatchLogsRows.js';

/** A Logs Insights read of many items, a query per batch of items. */
export interface CloudWatchLogsBatchedRead<TItem> extends Omit<CloudWatchLogsRead, 'query' | 'identifiers'> {
  readonly items: ReadonlyArray<TItem>;
  readonly batchSize?: number;
  query(batch: ReadonlyArray<TItem>): string;
  identifier(item: TItem): EvidenceIdentifier;
  rowsOf?(rows: CloudWatchLogsRows, batch: ReadonlyArray<TItem>): CloudWatchLogsRows;
  belongs?(row: CloudWatchLogsRow, item: TItem): boolean;
  rowIdentity?(row: CloudWatchLogsRow): string;
}
