/**
 * Shared test fixtures for go-search-jira: Jira attachments and issues, and an
 * in-memory FTS index with its schema and repository.
 */

import { GOFtsIndex } from '@go-automation/go-documents';

import { AttachmentRepository } from '../../storage/AttachmentRepository.js';
import { IndexSchemaManager } from '../../storage/IndexSchemaManager.js';
import { AttachmentSyncStatus } from '../../types/AttachmentSyncStatus.js';
import type { JiraAttachment } from '../../types/JiraAttachment.js';
import type { JiraIssue } from '../../types/JiraIssue.js';

/** Timestamp of the seeded "previous successful sync". */
export const SEEDED_AT = '2026-01-01T00:00:00.000Z';

/** Content hash of the seeded "previous successful sync". */
export const SEEDED_HASH = 'sha256-old';

/** An opened in-memory index together with the repository over it. */
export interface TestIndex {
  readonly index: GOFtsIndex;
  readonly repository: AttachmentRepository;
}

/**
 * Builds a Jira attachment (a small PDF by default).
 *
 * @param overrides - Fields replacing the defaults
 * @returns The attachment
 */
export function makeAttachment(overrides: Partial<JiraAttachment> = {}): JiraAttachment {
  return {
    id: '1001',
    filename: 'doc.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    created: SEEDED_AT,
    contentUrl: 'https://example.invalid/x',
    author: 'tester',
    ...overrides,
  };
}

/**
 * Builds the issue `PN-1` carrying the given attachments.
 *
 * @param attachments - Attachments of the issue
 * @returns The issue
 */
export function makeIssue(attachments: ReadonlyArray<JiraAttachment>): JiraIssue {
  return { key: 'PN-1', summary: 'sample', projectKey: 'PN', updated: SEEDED_AT, attachments };
}

/**
 * Opens an in-memory FTS index with the go-search-jira schema. The caller closes it.
 *
 * @returns The index and a repository over it
 */
export async function openTestIndex(): Promise<TestIndex> {
  const index = new GOFtsIndex({
    databasePath: ':memory:',
    ftsTableName: 'attachments_fts',
    metadataColumns: ['issue_key', 'project_key', 'filename', 'mime_type'],
  });
  await index.open();
  new IndexSchemaManager(index).ensureSchema();
  return { index, repository: new AttachmentRepository(index) };
}

/**
 * Seeds a previous successful sync: an `indexed` row plus its searchable FTS document.
 *
 * @param testIndex - The index and repository to seed
 * @param issue - The issue owning the attachment
 * @param attachment - The attachment to mark as indexed
 * @param content - Searchable text of the FTS document
 */
export function seedIndexedAttachment(
  { index, repository }: TestIndex,
  issue: JiraIssue,
  attachment: JiraAttachment,
  content: string,
): void {
  repository.upsertAttachmentMetadata(issue, attachment, AttachmentSyncStatus.INDEXED, null, SEEDED_AT, {
    contentHash: SEEDED_HASH,
    indexedAt: SEEDED_AT,
  });
  index.upsert({
    id: attachment.id,
    content,
    metadata: {
      issue_key: issue.key,
      project_key: issue.projectKey,
      filename: attachment.filename,
      mime_type: attachment.mimeType,
    },
  });
}
