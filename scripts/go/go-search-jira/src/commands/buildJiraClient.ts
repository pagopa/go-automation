/**
 * Helper that constructs a `JiraClient` from the resolved configuration.
 */
import { JiraAuthBuilder } from '../jira/JiraAuthBuilder.js';
import { JiraClient } from '../jira/JiraClient.js';
import type { GoSearchJiraConfig } from '../types/GoSearchJiraConfig.js';

export function buildJiraClient(config: GoSearchJiraConfig): JiraClient {
  if (config.jiraUrl.length === 0) {
    throw new Error('jira.url is required for actions that contact Jira');
  }

  const authorization = JiraAuthBuilder.build({
    authMode: config.jiraAuthMode,
    email: config.jiraEmail,
    token: config.jiraToken,
  });

  return new JiraClient({
    baseUrl: config.jiraUrl,
    authorizationHeader: authorization,
  });
}
