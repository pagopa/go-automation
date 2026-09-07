import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { jiraLink, slackLink } from '../analysisLinks.js';

describe('analysis links', () => {
  it('builds a canonical Jira link', () => {
    assert.deepStrictEqual(jiraLink('PIN-1234'), {
      url: 'https://pagopa.atlassian.net/browse/PIN-1234',
      name: 'PIN-1234',
      type: 'JIRA',
    });
  });

  it('builds a canonical Slack link', () => {
    assert.deepStrictEqual(slackLink('https://pagopaspa.slack.com/archives/C123/p456', 'Thread incidente'), {
      url: 'https://pagopaspa.slack.com/archives/C123/p456',
      name: 'Thread incidente',
      type: 'SLACK',
    });
  });
});
