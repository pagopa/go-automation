import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AttachmentPlanner } from '../sync/AttachmentPlanner.js';
import type { AttachmentPlannerOptions } from '../sync/AttachmentPlanner.js';
import { AttachmentSkipReason } from '../types/AttachmentSyncStatus.js';
import type { AttachmentSkipReasonValue } from '../types/AttachmentSyncStatus.js';
import type { JiraAttachment } from '../types/JiraAttachment.js';
import { makeAttachment, makeIssue } from './helpers/jiraTestFixtures.js';

const DEFAULT_OPTIONS: AttachmentPlannerOptions = {
  force: false,
  maxAttachmentSizeBytes: 1024 * 1024,
  canExtract: (mimeType) => mimeType === 'application/pdf',
  hasInIndex: () => false,
};

describe('AttachmentPlanner', () => {
  const planner = new AttachmentPlanner();

  const cases: ReadonlyArray<{
    readonly title: string;
    readonly attachment?: Partial<JiraAttachment>;
    readonly options?: Partial<AttachmentPlannerOptions>;
    readonly action: 'download' | 'force-download' | 'skip';
    readonly reason?: AttachmentSkipReasonValue;
  }> = [
    { title: 'downloads a fresh, supported, in-budget attachment', action: 'download' },
    {
      title: 'skips an attachment already in the index',
      options: { hasInIndex: () => true },
      action: 'skip',
      reason: AttachmentSkipReason.ALREADY_INDEXED,
    },
    {
      title: 'force-downloads an indexed attachment under --force',
      options: { force: true, hasInIndex: () => true },
      action: 'force-download',
    },
    {
      title: 'skips an attachment above the size limit, even under --force',
      attachment: { size: 99_999 },
      options: { force: true, maxAttachmentSizeBytes: 1024 },
      action: 'skip',
      reason: AttachmentSkipReason.TOO_LARGE,
    },
    {
      title: 'skips an attachment with an unsupported MIME type',
      attachment: { mimeType: 'image/png' },
      action: 'skip',
      reason: AttachmentSkipReason.UNSUPPORTED_MIME,
    },
  ];

  for (const { title, attachment, options, action, reason } of cases) {
    it(title, () => {
      const plan = planner.planForIssue(makeIssue([makeAttachment(attachment)]), { ...DEFAULT_OPTIONS, ...options });

      assert.strictEqual(plan.length, 1);
      const decision = plan[0]!; // Safe: length checked above
      assert.strictEqual(decision.action, action);
      assert.strictEqual(decision.action === 'skip' ? decision.reason : undefined, reason);
    });
  }
});
