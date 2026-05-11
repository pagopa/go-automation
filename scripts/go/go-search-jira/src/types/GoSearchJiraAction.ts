/**
 * Sub-actions exposed by the go-search-jira CLI.
 */
export const GoSearchJiraAction = {
  SYNC: 'sync',
  SEARCH: 'search',
  STATUS: 'status',
  CLEAN: 'clean',
} as const;

export type GoSearchJiraActionValue = (typeof GoSearchJiraAction)[keyof typeof GoSearchJiraAction];
