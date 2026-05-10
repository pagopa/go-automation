import type { JiraAttachment } from './JiraAttachment.js';

/**
 * Subset of the Jira issue payload consumed by go-search-jira.
 * Fields mirror the `summary`, `attachment`, `updated`, `project` selection
 * passed to the JQL search endpoint.
 */
export interface JiraIssue {
  readonly key: string;
  readonly summary: string;
  readonly projectKey: string;
  readonly updated: string;
  readonly attachments: ReadonlyArray<JiraAttachment>;
}
