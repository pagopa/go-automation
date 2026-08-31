import type { AnalysisLinkRef } from '../framework.js';

const JIRA_BROWSE_URL = 'https://pagopa.atlassian.net/browse';

/** Builds the canonical analysis link for a Jira issue. */
export function jiraLink(key: string): AnalysisLinkRef {
  return { url: `${JIRA_BROWSE_URL}/${key}`, name: key, type: 'JIRA' };
}

/** Builds the canonical analysis link for a Slack message or thread. */
export function slackLink(url: string, name: string): AnalysisLinkRef {
  return { url, name, type: 'SLACK' };
}
