/**
 * Resolves a list of Jira issues to sync, using either a JQL query or an
 * explicit list of issue keys. The two modes are mutually exclusive at the
 * API level but the caller may pass both: `--issue-keys` always wins.
 */
import type { JiraClient } from '../jira/JiraClient.js';
import type { JiraIssue } from '../types/JiraIssue.js';

export interface IssueDiscoveryOptions {
  readonly jql: string;
  readonly issueKeys: ReadonlyArray<string>;
}

export class IssueDiscovery {
  constructor(private readonly client: JiraClient) {}

  /**
   * Returns an async iterable over the resolved issues.
   * Caller is responsible for handling backpressure.
   *
   * @throws Error if neither a JQL query nor any issue key is provided.
   */
  public discover(options: IssueDiscoveryOptions): AsyncIterable<JiraIssue> {
    if (options.issueKeys.length > 0) {
      return this.discoverByKeys(options.issueKeys);
    }
    if (options.jql.trim().length === 0) {
      throw new Error('IssueDiscovery: either --jql or --jira-issue-keys must be provided');
    }
    return this.client.searchIssues(options.jql);
  }

  private async *discoverByKeys(keys: ReadonlyArray<string>): AsyncIterableIterator<JiraIssue> {
    for (const key of keys) {
      const issue = await this.client.getIssue(key);
      if (issue !== undefined) {
        yield issue;
      }
    }
  }
}
