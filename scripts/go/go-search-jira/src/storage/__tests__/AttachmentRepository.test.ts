import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AttachmentSyncStatus } from '../../types/AttachmentSyncStatus.js';
import {
  makeAttachment,
  makeIssue,
  openTestIndex,
  seedIndexedAttachment,
} from '../../__tests__/helpers/jiraTestFixtures.js';

describe('AttachmentRepository', () => {
  it('clears stale index metadata when an indexed attachment becomes failed', async () => {
    const testIndex = await openTestIndex();

    try {
      const attachment = makeAttachment();
      const issue = makeIssue([attachment]);
      seedIndexedAttachment(testIndex, issue, attachment, 'previous content');

      testIndex.repository.upsertAttachmentMetadata(
        issue,
        attachment,
        AttachmentSyncStatus.FAILED,
        'extract_error: parser failed',
        '2026-01-02T00:00:00.000Z',
        { contentHash: 'sha256-new', indexedAt: null },
      );

      const row = testIndex.repository.getAttachment(attachment.id);
      assert.strictEqual(row?.status, AttachmentSyncStatus.FAILED);
      assert.strictEqual(row?.statusReason, 'extract_error: parser failed');
      assert.strictEqual(row?.contentHash, null);
      assert.strictEqual(row?.indexedAt, null);
    } finally {
      await testIndex.index.close();
    }
  });
});
