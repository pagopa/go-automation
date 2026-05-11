/**
 * Authentication mode for the Jira Cloud REST API v3 client.
 *
 * - `basic`: HTTP Basic with `email:apiToken`.
 * - `bearer`: HTTP Bearer for Cloud REST API v3-compatible integrations.
 *
 * Jira Data Center / Server is intentionally not covered by this client: it
 * uses different REST API paths and pagination semantics.
 */
export const JiraAuthMode = {
  BASIC: 'basic',
  BEARER: 'bearer',
} as const;

export type JiraAuthModeValue = (typeof JiraAuthMode)[keyof typeof JiraAuthMode];
