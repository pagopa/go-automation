import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AttachmentPlanner } from '../sync/AttachmentPlanner.js';
import { AttachmentSkipReason } from '../types/AttachmentSyncStatus.js';
import type { JiraAttachment } from '../types/JiraAttachment.js';
import type { JiraIssue } from '../types/JiraIssue.js';

function makeAttachment(overrides: Partial<JiraAttachment> = {}): JiraAttachment {
  return {
    id: '1001',
    filename: 'doc.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    created: '2026-01-01T00:00:00.000Z',
    contentUrl: 'https://example.invalid/x',
    author: 'tester',
    ...overrides,
  };
}

function makeIssue(attachments: ReadonlyArray<JiraAttachment>): JiraIssue {
  return {
    key: 'PN-1',
    summary: 'sample',
    projectKey: 'PN',
    updated: '2026-01-01T00:00:00.000Z',
    attachments,
  };
}

describe('AttachmentPlanner', () => {
  const planner = new AttachmentPlanner();

  it('plans a download for a fresh, supported, in-budget attachment', () => {
    const issue = makeIssue([makeAttachment()]);
    const plan = planner.planForIssue(issue, {
      force: false,
      maxAttachmentSizeBytes: 1024 * 1024,
      canExtract: () => true,
      hasInIndex: () => false,
    });
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0]!.action, 'download');
  });

  it('skips attachments that are already in the index', () => {
    const issue = makeIssue([makeAttachment()]);
    const plan = planner.planForIssue(issue, {
      force: false,
      maxAttachmentSizeBytes: 1024 * 1024,
      canExtract: () => true,
      hasInIndex: () => true,
    });
    assert.strictEqual(plan.length, 1);
    const decision = plan[0]!;
    assert.strictEqual(decision.action, 'skip');
    if (decision.action === 'skip') {
      assert.strictEqual(decision.reason, AttachmentSkipReason.ALREADY_INDEXED);
    }
  });

  it('returns force-download when --force is set even for indexed attachments', () => {
    const issue = makeIssue([makeAttachment()]);
    const plan = planner.planForIssue(issue, {
      force: true,
      maxAttachmentSizeBytes: 1024 * 1024,
      canExtract: () => true,
      hasInIndex: () => true,
    });
    assert.strictEqual(plan[0]!.action, 'force-download');
  });

  it('skips attachments above the size limit', () => {
    const issue = makeIssue([makeAttachment({ size: 99_999 })]);
    const plan = planner.planForIssue(issue, {
      force: false,
      maxAttachmentSizeBytes: 1024,
      canExtract: () => true,
      hasInIndex: () => false,
    });
    const decision = plan[0]!;
    assert.strictEqual(decision.action, 'skip');
    if (decision.action === 'skip') {
      assert.strictEqual(decision.reason, AttachmentSkipReason.TOO_LARGE);
    }
  });

  it('skips attachments with unsupported MIME', () => {
    const issue = makeIssue([makeAttachment({ mimeType: 'image/png' })]);
    const plan = planner.planForIssue(issue, {
      force: false,
      maxAttachmentSizeBytes: 1024 * 1024,
      canExtract: (mimeType) => mimeType === 'application/pdf',
      hasInIndex: () => false,
    });
    const decision = plan[0]!;
    assert.strictEqual(decision.action, 'skip');
    if (decision.action === 'skip') {
      assert.strictEqual(decision.reason, AttachmentSkipReason.UNSUPPORTED_MIME);
    }
  });
});
