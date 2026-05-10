/**
 * Authentication mode for the Jira REST API client.
 *
 * - `basic`: HTTP Basic with `email:apiToken` (Jira Cloud).
 * - `bearer`: HTTP Bearer (Jira Data Center / personal access tokens).
 */
export const JiraAuthMode = {
  BASIC: 'basic',
  BEARER: 'bearer',
} as const;

export type JiraAuthModeValue = (typeof JiraAuthMode)[keyof typeof JiraAuthMode];
