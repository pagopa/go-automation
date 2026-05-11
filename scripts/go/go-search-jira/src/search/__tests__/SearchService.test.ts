import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Core } from '@go-automation/go-common';

import { SearchService } from '../SearchService.js';
import { AttachmentRepository } from '../../storage/AttachmentRepository.js';
import { IndexSchemaManager } from '../../storage/IndexSchemaManager.js';
import { AttachmentSyncStatus } from '../../types/AttachmentSyncStatus.js';
import type { JiraAttachment } from '../../types/JiraAttachment.js';
import type { JiraIssue } from '../../types/JiraIssue.js';

function makeAttachment(): JiraAttachment {
  return {
    id: '1001',
    filename: 'notes.txt',
    mimeType: 'text/plain',
    size: 12,
    created: '2026-01-01T00:00:00.000Z',
    contentUrl: 'https://example.invalid/attachment',
    author: 'tester',
  };
}

function makeIssue(attachment: JiraAttachment): JiraIssue {
  return {
    key: 'PN-1',
    summary: 'sample issue',
    projectKey: 'PN',
    updated: '2026-01-01T00:00:00.000Z',
    attachments: [attachment],
  };
}

describe('SearchService', () => {
  it('allows empty issueUrl values when Jira URL generation is disabled', async () => {
    const index = new Core.GOFtsIndex({
      databasePath: ':memory:',
      ftsTableName: 'attachments_fts',
      metadataColumns: ['issue_key', 'project_key', 'filename', 'mime_type'],
    });
    await index.open();

    try {
      new IndexSchemaManager(index).ensureSchema();
      const repository = new AttachmentRepository(index);
      const attachment = makeAttachment();
      const issue = makeIssue(attachment);

      repository.upsertAttachmentMetadata(
        issue,
        attachment,
        AttachmentSyncStatus.INDEXED,
        null,
        '2026-01-01T00:00:00.000Z',
        { contentHash: 'sha256-abc', indexedAt: '2026-01-01T00:00:00.000Z' },
      );
      index.upsert({
        id: attachment.id,
        content: 'hello indexed attachment',
        metadata: {
          issue_key: issue.key,
          project_key: issue.projectKey,
          filename: attachment.filename,
          mime_type: attachment.mimeType,
        },
      });

      const service = new SearchService({
        index,
        repository,
        issueUrlBuilder: { buildIssueUrl: () => '' },
      });

      const results = service.search({
        query: 'hello',
        mode: 'full-text',
        limit: 10,
        project: '',
      });

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0]!.issueUrl, '');
    } finally {
      await index.close();
    }
  });
});
