import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SearchService } from '../SearchService.js';
import {
  makeAttachment,
  makeIssue,
  openTestIndex,
  seedIndexedAttachment,
} from '../../__tests__/helpers/jiraTestFixtures.js';

describe('SearchService', () => {
  it('allows empty issueUrl values when Jira URL generation is disabled', async () => {
    const testIndex = await openTestIndex();

    try {
      const attachment = makeAttachment({ filename: 'notes.txt', mimeType: 'text/plain' });
      seedIndexedAttachment(testIndex, makeIssue([attachment]), attachment, 'hello indexed attachment');

      const service = new SearchService({ ...testIndex, issueUrlBuilder: { buildIssueUrl: () => '' } });
      const results = service.search({ query: 'hello', mode: 'full-text', limit: 10, project: '' });

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0]!.issueUrl, '');
    } finally {
      await testIndex.index.close();
    }
  });
});
