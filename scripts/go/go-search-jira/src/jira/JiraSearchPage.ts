import type { JiraIssue } from '../types/JiraIssue.js';

/**
 * One page of search results from `/rest/api/3/search/jql`.
 */
export interface JiraSearchPage {
  readonly issues: ReadonlyArray<JiraIssue>;
  readonly nextPageToken: string | undefined;
  readonly isLast: boolean;
}
