import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Core } from '@go-automation/go-common';

import { AttachmentRepository } from '../AttachmentRepository.js';
import { IndexSchemaManager } from '../IndexSchemaManager.js';
import { AttachmentSyncStatus } from '../../types/AttachmentSyncStatus.js';
import type { JiraAttachment } from '../../types/JiraAttachment.js';
import type { JiraIssue } from '../../types/JiraIssue.js';

function makeAttachment(): JiraAttachment {
  return {
    id: '1001',
    filename: 'doc.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    created: '2026-01-01T00:00:00.000Z',
    contentUrl: 'https://example.invalid/doc.pdf',
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

async function openRepository(): Promise<{ readonly index: Core.GOFtsIndex; readonly repository: AttachmentRepository }> {
  const index = new Core.GOFtsIndex({
    databasePath: ':memory:',
    ftsTableName: 'attachments_fts',
    metadataColumns: ['issue_key', 'project_key', 'filename', 'mime_type'],
  });
  await index.open();
  new IndexSchemaManager(index).ensureSchema();
  return { index, repository: new AttachmentRepository(index) };
}

describe('AttachmentRepository', () => {
  it('clears stale index metadata when an indexed attachment becomes failed', async () => {
    const { index, repository } = await openRepository();

    try {
      const attachment = makeAttachment();
      const issue = makeIssue(attachment);

      repository.upsertAttachmentMetadata(
        issue,
        attachment,
        AttachmentSyncStatus.INDEXED,
        null,
        '2026-01-01T00:00:00.000Z',
        { contentHash: 'sha256-old', indexedAt: '2026-01-01T00:00:00.000Z' },
      );
      repository.upsertAttachmentMetadata(
        issue,
        attachment,
        AttachmentSyncStatus.FAILED,
        'extract_error: parser failed',
        '2026-01-02T00:00:00.000Z',
        { contentHash: 'sha256-new', indexedAt: null },
      );

      const row = repository.getAttachment(attachment.id);
      assert.strictEqual(row?.status, AttachmentSyncStatus.FAILED);
      assert.strictEqual(row?.statusReason, 'extract_error: parser failed');
      assert.strictEqual(row?.contentHash, null);
      assert.strictEqual(row?.indexedAt, null);
    } finally {
      await index.close();
    }
  });
});
