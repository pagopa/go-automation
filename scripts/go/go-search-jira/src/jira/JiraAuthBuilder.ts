/**
 * Builds the `Authorization` header for the Jira REST API.
 *
 * Receives the API token directly. Resolution of the token value across CLI
 * args, environment variables and config files is the responsibility of
 * GOConfig (the `jira.token` parameter is marked `sensitive: true` so it is
 * redacted in summaries and logs); this class never reads `process.env`.
 */
import { JiraAuthMode, type JiraAuthModeValue } from '../types/JiraAuthMode.js';

export interface JiraAuthBuilderInput {
  readonly authMode: JiraAuthModeValue;
  readonly email: string;
  readonly token: string;
}

export class JiraAuthBuilder {
  /**
   * Returns the `Authorization` header value (e.g. `Basic …` or `Bearer …`).
   *
   * @throws Error if the token is empty or the input is incomplete.
   */
  public static build(input: JiraAuthBuilderInput): string {
    if (input.token.length === 0) {
      throw new Error(
        'Jira token is not set. Provide it via --jira-token, the JIRA_TOKEN env var, or the config file.',
      );
    }

    if (input.authMode === JiraAuthMode.BASIC) {
      if (input.email.length === 0) {
        throw new Error('Jira basic auth requires --jira-email');
      }
      const credentials = Buffer.from(`${input.email}:${input.token}`).toString('base64');
      return `Basic ${credentials}`;
    }

    if (input.authMode === JiraAuthMode.BEARER) {
      return `Bearer ${input.token}`;
    }

    throw new Error(`Unknown Jira auth mode: ${String(input.authMode)}`);
  }
}
