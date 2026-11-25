import type { AWSCloudWatchLogsQueryStatistics } from './AWSCloudWatchLogsQueryStatistics.js';

/** One Logs Insights query actually run, with the profile and log groups it used. */
export interface AWSCloudWatchLogsQueryExecution {
  readonly queryId: string;
  readonly profile: string;
  readonly logGroups: ReadonlyArray<string>;
  readonly statistics: AWSCloudWatchLogsQueryStatistics;
  /** Rows this physical query returned, before they are merged with the rows of other queries. */
  readonly rowsReturned?: number;
  /**
   * Why some result pages of this query were not read: `budget` when they were left unread (no pagination was
   * requested, or the page budget ran out), `failed` when a page could not be fetched. With pagination and without
   * `partialResults` a page budget overrun or a failed page throws instead.
   */
  readonly unreadPages?: 'budget' | 'failed';
}
