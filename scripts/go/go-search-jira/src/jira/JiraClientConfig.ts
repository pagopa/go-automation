/**
 * Configuration for JiraClient.
 */
export interface JiraClientConfig {
  /** Base URL of the Jira instance, e.g. https://example.atlassian.net */
  readonly baseUrl: string;
  /** Authorization header (`Basic …` or `Bearer …`) — never logged. */
  readonly authorizationHeader: string;
  /** Per-request timeout. Defaults to 60_000. */
  readonly timeoutMs?: number;
  /** Maximum retries on retriable failures (downloads). */
  readonly maxRetries?: number;
}
