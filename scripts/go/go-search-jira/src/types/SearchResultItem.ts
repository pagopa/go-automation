/**
 * Result item returned by the search action.
 */
export interface SearchResultItem {
  readonly issueKey: string;
  readonly summary: string;
  readonly projectKey: string;
  readonly attachmentId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly score: number;
  readonly snippet: string;
  readonly issueUrl: string;
  readonly attachmentUrl: string;
}
