import type { Core } from '@go-automation/go-common';

import type { GoSearchJiraActionValue } from './GoSearchJiraAction.js';
import type { JiraAuthModeValue } from './JiraAuthMode.js';

/**
 * Validated runtime configuration for the go-search-jira script.
 *
 * Field names follow the dot-notation → camelCase rule used by GOConfig:
 *   `jira.url`        → `jiraUrl`
 *   `jira.token`      → `jiraToken`         (value, not env-var name; redacted)
 *   `jira.jql`        → `jiraJql`
 *   `jira.issue.keys` → `jiraIssueKeys`
 *   `search.query`    → `searchQuery`
 *   `output.file`     → `outputFile`
 *   `output.format`   → `outputFormat`
 *
 * Defaults for every non-required parameter are declared in `src/config.ts`
 * via `defaultValue`, so the framework populates these fields with their
 * defaults when the user does not provide a value.
 */
export interface GoSearchJiraConfig {
  // === action ===
  readonly action: GoSearchJiraActionValue;

  // === jira ===
  readonly jiraUrl: string;
  readonly jiraEmail: string;
  /** API token value (resolved by GOConfig from CLI / env / config file). Sensitive. */
  readonly jiraToken: string;
  readonly jiraAuthMode: JiraAuthModeValue;
  readonly jiraJql: string;
  readonly jiraIssueKeys: ReadonlyArray<string>;

  // === sync ===
  readonly syncMaxParallelDownloads: number;
  readonly syncMaxAttachmentSizeMb: number;
  readonly syncKeepRaw: boolean;
  readonly syncDryRun: boolean;
  readonly syncForce: boolean;

  // === search ===
  readonly searchQuery: string;
  readonly searchMode: 'full-text' | 'literal';
  readonly searchLimit: number;
  readonly searchProject: string;

  // === output (search results) ===
  readonly outputFile: string;
  readonly outputFormat: Core.GOExportFormat;

  // === clean ===
  readonly cleanRawOnly: boolean;
  readonly cleanYes: boolean;

  // === storage ===
  readonly storageDataDir: string;
  readonly storageIndexFileName: string;
}
