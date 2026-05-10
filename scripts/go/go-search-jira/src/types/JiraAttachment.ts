/**
 * Attachment metadata as returned by Jira REST API v3.
 */
export interface JiraAttachment {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly created: string;
  readonly contentUrl: string;
  readonly author: string | undefined;
}
