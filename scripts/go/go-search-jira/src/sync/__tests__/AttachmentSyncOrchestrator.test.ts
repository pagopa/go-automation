/**
 * End-to-end tests for the orchestrator focused on bookkeeping invariants.
 * We construct an in-memory `GOFtsIndex`, a real `AttachmentRepository`, and
 * minimal fakes for the Jira-facing collaborators.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Core } from '@go-automation/go-common';

import { AttachmentSyncOrchestrator } from '../AttachmentSyncOrchestrator.js';
import { AttachmentCachePaths } from '../AttachmentCachePaths.js';
import { AttachmentIndexer } from '../AttachmentIndexer.js';
import { IssueDiscovery } from '../../discovery/IssueDiscovery.js';
import { JiraClient } from '../../jira/JiraClient.js';
import { IndexSchemaManager } from '../../storage/IndexSchemaManager.js';
import { AttachmentRepository } from '../../storage/AttachmentRepository.js';
import { AttachmentSyncStatus } from '../../types/AttachmentSyncStatus.js';
import type { JiraIssue } from '../../types/JiraIssue.js';
import type { JiraAttachment } from '../../types/JiraAttachment.js';

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

class FakeDiscovery extends IssueDiscovery {
  constructor(private readonly issues: ReadonlyArray<JiraIssue>) {
    // Cast: parent expects a JiraClient but we override `discover` so it is
    // never used. Cast through unknown to satisfy the type checker.
    super({} as unknown as JiraClient);
  }

  public override discover(): AsyncIterable<JiraIssue> {
    const issues = this.issues;
    return {
      [Symbol.asyncIterator](): AsyncIterator<JiraIssue> {
        let index = 0;
        return {
          async next(): Promise<IteratorResult<JiraIssue>> {
            if (index >= issues.length) return Promise.resolve({ value: undefined, done: true });
            const value = issues[index]!;
            index += 1;
            return Promise.resolve({ value, done: false });
          },
        };
      },
    };
  }
}

const NOOP_LOGGER = {
  section: () => undefined,
  info: () => undefined,
  warning: () => undefined,
  error: () => undefined,
  success: () => undefined,
  text: () => undefined,
  newline: () => undefined,
  log: () => undefined,
  table: () => undefined,
} as unknown as Core.GOLogger;

async function waitUntil(predicate: () => boolean, description: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.fail(`Timed out waiting for ${description}`);
}

describe('AttachmentSyncOrchestrator — handleSkipDecision', () => {
  it('preserves indexed status when re-syncing an already-indexed attachment', async () => {
    // Setup: open an in-memory index + schema + repository.
    const index = new Core.GOFtsIndex({
      databasePath: ':memory:',
      ftsTableName: 'attachments_fts',
      metadataColumns: ['issue_key', 'project_key', 'filename', 'mime_type'],
    });
    await index.open();
    new IndexSchemaManager(index).ensureSchema();
    const repository = new AttachmentRepository(index);

    const attachment = makeAttachment({ id: '42', filename: 'doc.pdf' });
    const issue = makeIssue([attachment]);

    // Seed: simulate a previous successful sync. Row is `indexed`, FTS doc exists.
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
      content: 'hello world',
      metadata: {
        issue_key: issue.key,
        project_key: issue.projectKey,
        filename: attachment.filename,
        mime_type: attachment.mimeType,
      },
    });

    // Sanity check.
    const before = repository.getAttachment(attachment.id);
    assert.strictEqual(before?.status, AttachmentSyncStatus.INDEXED);
    assert.strictEqual(before?.contentHash, 'sha256-abc');

    // Run the orchestrator with the SAME attachment — planner returns
    // skip(already_indexed) because the row is in the index.
    const registry = new Core.GOTextExtractorRegistry();
    registry.register(new Core.GOPlainTextExtractor());
    registry.register(new Core.GOPdfTextExtractor()); // makes canHandle('application/pdf') true

    const orchestrator = new AttachmentSyncOrchestrator({
      logger: NOOP_LOGGER,
      index,
      repository,
      registry,
      client: {} as unknown as JiraClient,
      discovery: new FakeDiscovery([issue]),
      indexer: {} as unknown as AttachmentIndexer,
      cachePaths: new AttachmentCachePaths('/tmp/unused'),
    });

    const report = await orchestrator.run({
      jql: 'unused',
      issueKeys: [],
      maxParallelDownloads: 1,
      maxAttachmentSizeBytes: 100_000_000,
      dryRun: false,
      force: false,
    });

    // Behaviour: the row must still be INDEXED, NOT flipped to SKIPPED.
    const after = repository.getAttachment(attachment.id);
    assert.strictEqual(
      after?.status,
      AttachmentSyncStatus.INDEXED,
      'row status must remain "indexed" after an already_indexed skip decision',
    );
    assert.strictEqual(after?.contentHash, 'sha256-abc', 'content_hash must be preserved');
    assert.strictEqual(after?.indexedAt, '2026-01-01T00:00:00.000Z', 'indexed_at must be preserved');
    // The skip is still reported in the run summary.
    assert.strictEqual(report.skipped, 1);
    assert.strictEqual(report.indexed, 0);

    // And the FTS document remains searchable.
    const hits = index.search({ query: 'hello' });
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0]!.id, attachment.id);

    await index.close();
  });
});

describe('AttachmentSyncOrchestrator — hard task failures', () => {
  it('rethrows unexpected download/index task failures instead of swallowing them', async () => {
    const index = new Core.GOFtsIndex({
      databasePath: ':memory:',
      ftsTableName: 'attachments_fts',
      metadataColumns: ['issue_key', 'project_key', 'filename', 'mime_type'],
    });
    await index.open();

    try {
      new IndexSchemaManager(index).ensureSchema();
      const repository = new AttachmentRepository(index);
      const attachment = makeAttachment({ id: '99', filename: 'notes.txt', mimeType: 'text/plain' });
      const issue = makeIssue([attachment]);

      const registry = new Core.GOTextExtractorRegistry();
      registry.register(new Core.GOPlainTextExtractor());

      const hardError = new Error('sqlite write failed');
      const orchestrator = new AttachmentSyncOrchestrator({
        logger: NOOP_LOGGER,
        index,
        repository,
        registry,
        client: {
          downloadAttachment: async () => ({ sha256: 'sha256-hard-failure', bytesWritten: 12, attempts: 1 }),
        } as unknown as JiraClient,
        discovery: new FakeDiscovery([issue]),
        indexer: {
          indexAttachment: async () => {
            throw hardError;
          },
        } as unknown as AttachmentIndexer,
        cachePaths: new AttachmentCachePaths('/tmp/unused'),
      });

      await assert.rejects(
        () =>
          orchestrator.run({
            jql: 'unused',
            issueKeys: [],
            maxParallelDownloads: 1,
            maxAttachmentSizeBytes: 100_000_000,
            dryRun: false,
            force: false,
          }),
        (error: unknown): boolean => error === hardError,
      );
    } finally {
      await index.close();
    }
  });
});

describe('AttachmentSyncOrchestrator — force refresh failures', () => {
  it('keeps a previous indexed document searchable when a forced download fails', async () => {
    const index = new Core.GOFtsIndex({
      databasePath: ':memory:',
      ftsTableName: 'attachments_fts',
      metadataColumns: ['issue_key', 'project_key', 'filename', 'mime_type'],
    });
    await index.open();

    try {
      new IndexSchemaManager(index).ensureSchema();
      const repository = new AttachmentRepository(index);
      const attachment = makeAttachment({ id: '77', filename: 'notes.txt', mimeType: 'text/plain' });
      const issue = makeIssue([attachment]);

      repository.upsertAttachmentMetadata(
        issue,
        attachment,
        AttachmentSyncStatus.INDEXED,
        null,
        '2026-01-01T00:00:00.000Z',
        { contentHash: 'sha256-old', indexedAt: '2026-01-01T00:00:00.000Z' },
      );
      index.upsert({
        id: attachment.id,
        content: 'previous searchable content',
        metadata: {
          issue_key: issue.key,
          project_key: issue.projectKey,
          filename: attachment.filename,
          mime_type: attachment.mimeType,
        },
      });

      const registry = new Core.GOTextExtractorRegistry();
      registry.register(new Core.GOPlainTextExtractor());
      const orchestrator = new AttachmentSyncOrchestrator({
        logger: NOOP_LOGGER,
        index,
        repository,
        registry,
        client: {
          downloadAttachment: async () => {
            throw new Error('network timeout');
          },
        } as unknown as JiraClient,
        discovery: new FakeDiscovery([issue]),
        indexer: {} as unknown as AttachmentIndexer,
        cachePaths: new AttachmentCachePaths('/tmp/unused'),
      });

      const report = await orchestrator.run({
        jql: 'unused',
        issueKeys: [],
        maxParallelDownloads: 1,
        maxAttachmentSizeBytes: 100_000_000,
        dryRun: false,
        force: true,
      });

      const row = repository.getAttachment(attachment.id);
      assert.strictEqual(report.failed, 1);
      assert.strictEqual(report.indexed, 0);
      assert.strictEqual(row?.status, AttachmentSyncStatus.INDEXED);
      assert.strictEqual(row?.contentHash, 'sha256-old');
      assert.strictEqual(row?.indexedAt, '2026-01-01T00:00:00.000Z');
      assert.strictEqual(index.search({ query: 'previous' }).length, 1);
    } finally {
      await index.close();
    }
  });

  it('keeps a previous indexed document searchable when forced extraction fails', async () => {
    const index = new Core.GOFtsIndex({
      databasePath: ':memory:',
      ftsTableName: 'attachments_fts',
      metadataColumns: ['issue_key', 'project_key', 'filename', 'mime_type'],
    });
    await index.open();

    try {
      new IndexSchemaManager(index).ensureSchema();
      const repository = new AttachmentRepository(index);
      const attachment = makeAttachment({ id: '78', filename: 'notes.txt', mimeType: 'text/plain' });
      const issue = makeIssue([attachment]);

      repository.upsertAttachmentMetadata(
        issue,
        attachment,
        AttachmentSyncStatus.INDEXED,
        null,
        '2026-01-01T00:00:00.000Z',
        { contentHash: 'sha256-old', indexedAt: '2026-01-01T00:00:00.000Z' },
      );
      index.upsert({
        id: attachment.id,
        content: 'previous extraction content',
        metadata: {
          issue_key: issue.key,
          project_key: issue.projectKey,
          filename: attachment.filename,
          mime_type: attachment.mimeType,
        },
      });

      const registry = new Core.GOTextExtractorRegistry();
      registry.register(new Core.GOPlainTextExtractor());
      const orchestrator = new AttachmentSyncOrchestrator({
        logger: NOOP_LOGGER,
        index,
        repository,
        registry,
        client: {
          downloadAttachment: async () => ({ sha256: 'sha256-new', bytesWritten: 12, attempts: 1 }),
        } as unknown as JiraClient,
        discovery: new FakeDiscovery([issue]),
        indexer: new AttachmentIndexer({
          registry,
          index,
          repository,
          keepRaw: false,
        }),
        cachePaths: new AttachmentCachePaths('/tmp/unused'),
      });

      const report = await orchestrator.run({
        jql: 'unused',
        issueKeys: [],
        maxParallelDownloads: 1,
        maxAttachmentSizeBytes: 100_000_000,
        dryRun: false,
        force: true,
      });

      const row = repository.getAttachment(attachment.id);
      assert.strictEqual(report.failed, 1);
      assert.strictEqual(report.indexed, 0);
      assert.strictEqual(row?.status, AttachmentSyncStatus.INDEXED);
      assert.strictEqual(row?.contentHash, 'sha256-old');
      assert.strictEqual(row?.indexedAt, '2026-01-01T00:00:00.000Z');
      assert.strictEqual(index.search({ query: 'previous' }).length, 1);
    } finally {
      await index.close();
    }
  });
});

describe('AttachmentSyncOrchestrator — download scheduling', () => {
  it('does not queue every attachment before a download slot is available', async () => {
    const index = new Core.GOFtsIndex({
      databasePath: ':memory:',
      ftsTableName: 'attachments_fts',
      metadataColumns: ['issue_key', 'project_key', 'filename', 'mime_type'],
    });
    await index.open();

    try {
      new IndexSchemaManager(index).ensureSchema();
      const repository = new AttachmentRepository(index);
      const attachments = [
        makeAttachment({ id: 'a1', filename: 'a1.txt', mimeType: 'text/plain' }),
        makeAttachment({ id: 'a2', filename: 'a2.txt', mimeType: 'text/plain' }),
        makeAttachment({ id: 'a3', filename: 'a3.txt', mimeType: 'text/plain' }),
      ];
      const issue = makeIssue(attachments);
      const started: string[] = [];
      const releases = new Map<string, () => void>();
      let activeDownloads = 0;
      let maxActiveDownloads = 0;

      const registry = new Core.GOTextExtractorRegistry();
      registry.register(new Core.GOPlainTextExtractor());
      const orchestrator = new AttachmentSyncOrchestrator({
        logger: NOOP_LOGGER,
        index,
        repository,
        registry,
        client: {
          downloadAttachment: async (attachment: JiraAttachment) => {
            started.push(attachment.id);
            activeDownloads += 1;
            maxActiveDownloads = Math.max(maxActiveDownloads, activeDownloads);
            return await new Promise<{
              readonly sha256: string;
              readonly bytesWritten: number;
              readonly attempts: number;
            }>((resolve) => {
              releases.set(attachment.id, () => {
                releases.delete(attachment.id);
                activeDownloads -= 1;
                resolve({ sha256: `sha256-${attachment.id}`, bytesWritten: 1, attempts: 1 });
              });
            });
          },
        } as unknown as JiraClient,
        discovery: new FakeDiscovery([issue]),
        indexer: {
          indexAttachment: async () => ({
            status: AttachmentSyncStatus.INDEXED,
            statusReason: null,
            preservedExistingIndex: false,
          }),
        } as unknown as AttachmentIndexer,
        cachePaths: new AttachmentCachePaths('/tmp/unused'),
      });

      const runPromise = orchestrator.run({
        jql: 'unused',
        issueKeys: [],
        maxParallelDownloads: 2,
        maxAttachmentSizeBytes: 100_000_000,
        dryRun: false,
        force: false,
      });

      await waitUntil(() => started.length === 2, 'first two downloads to start');
      assert.deepStrictEqual(started, ['a1', 'a2']);
      assert.strictEqual(maxActiveDownloads, 2);

      releases.get('a1')?.();
      await waitUntil(() => started.length === 3, 'third download to start after a slot is released');
      assert.deepStrictEqual(started, ['a1', 'a2', 'a3']);
      assert.strictEqual(maxActiveDownloads, 2);

      releases.get('a2')?.();
      releases.get('a3')?.();
      const report = await runPromise;
      assert.strictEqual(report.indexed, 3);
    } finally {
      await index.close();
    }
  });
});
