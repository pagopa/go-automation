/**
 * End-to-end tests for the orchestrator focused on bookkeeping invariants.
 * We construct an in-memory `GOFtsIndex`, a real `AttachmentRepository`, and
 * minimal fakes for the Jira-facing collaborators.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';

import { GOPdfTextExtractor, GOPlainTextExtractor, GOTextExtractorRegistry } from '@go-automation/go-documents';
import { GOFileDownloaderError } from '@pagopa/go-common/http';
import type { GOLogger } from '@pagopa/go-common/logging';

import { AttachmentSyncOrchestrator } from '../AttachmentSyncOrchestrator.js';
import type { AttachmentSyncOrchestratorOptions } from '../AttachmentSyncOrchestrator.js';
import { AttachmentCachePaths } from '../AttachmentCachePaths.js';
import { AttachmentIndexer } from '../AttachmentIndexer.js';
import { IssueDiscovery } from '../../discovery/IssueDiscovery.js';
import { JiraClient } from '../../jira/JiraClient.js';
import { AttachmentSkipReason, AttachmentSyncStatus } from '../../types/AttachmentSyncStatus.js';
import type { AttachmentSyncReport } from '../../types/AttachmentSyncReport.js';
import type { JiraIssue } from '../../types/JiraIssue.js';
import type { JiraAttachment } from '../../types/JiraAttachment.js';
import {
  makeAttachment,
  makeIssue,
  openTestIndex,
  SEEDED_AT,
  SEEDED_HASH,
  seedIndexedAttachment,
} from '../../__tests__/helpers/jiraTestFixtures.js';
import type { TestIndex } from '../../__tests__/helpers/jiraTestFixtures.js';

class FakeDiscovery extends IssueDiscovery {
  constructor(private readonly issues: ReadonlyArray<JiraIssue>) {
    // Cast: parent expects a JiraClient but we override `discover` so it is
    // never used. Cast through unknown to satisfy the type checker.
    super({} as unknown as JiraClient);
  }

  public override async *discover(): AsyncIterable<JiraIssue> {
    for (const issue of this.issues) {
      yield await Promise.resolve(issue);
    }
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
} as unknown as GOLogger;

const RUN_OPTIONS: AttachmentSyncOrchestratorOptions = {
  jql: 'unused',
  issueKeys: [],
  maxParallelDownloads: 1,
  maxAttachmentSizeBytes: 100_000_000,
  dryRun: false,
  force: false,
};

/** Result of a fake attachment download. */
interface FakeDownload {
  readonly sha256: string;
  readonly bytesWritten: number;
  readonly attempts: number;
}

type DownloadFn = (attachment: JiraAttachment) => Promise<FakeDownload>;

/** Collaborators a test may replace; the rest are inert. */
interface OrchestratorOverrides {
  readonly download?: DownloadFn;
  readonly indexer?: AttachmentIndexer;
  readonly registry?: GOTextExtractorRegistry;
}

type IndexerFactoryFn = (testIndex: TestIndex, registry: GOTextExtractorRegistry) => AttachmentIndexer;
type TestBodyFn = (testIndex: TestIndex) => Promise<void>;
type PredicateFn = () => boolean;

/** A registry able to extract plain text (and PDF, when asked). */
function textRegistry(withPdf = false): GOTextExtractorRegistry {
  const registry = new GOTextExtractorRegistry();
  registry.register(new GOPlainTextExtractor());
  if (withPdf) registry.register(new GOPdfTextExtractor());
  return registry;
}

/** Builds an orchestrator over the test index, syncing a single issue. */
function buildOrchestrator(
  testIndex: TestIndex,
  issue: JiraIssue,
  overrides: OrchestratorOverrides = {},
): AttachmentSyncOrchestrator {
  return new AttachmentSyncOrchestrator({
    logger: NOOP_LOGGER,
    ...testIndex,
    registry: overrides.registry ?? textRegistry(),
    client: { downloadAttachment: overrides.download } as unknown as JiraClient,
    discovery: new FakeDiscovery([issue]),
    indexer: overrides.indexer ?? ({} as unknown as AttachmentIndexer),
    cachePaths: new AttachmentCachePaths('/tmp/unused'),
  });
}

/** Runs `body` against a fresh in-memory index, always closing it. */
async function withTestIndex(body: TestBodyFn): Promise<void> {
  const testIndex = await openTestIndex();
  try {
    await body(testIndex);
  } finally {
    await testIndex.index.close();
  }
}

/** Asserts the row and the FTS document of a previous successful sync are untouched. */
function assertPreviousIndexKept({ index, repository }: TestIndex, attachment: JiraAttachment): void {
  const row = repository.getAttachment(attachment.id);
  assert.strictEqual(row?.status, AttachmentSyncStatus.INDEXED);
  assert.strictEqual(row?.contentHash, SEEDED_HASH);
  assert.strictEqual(row?.indexedAt, SEEDED_AT);
  assert.deepStrictEqual(
    index.search({ query: 'previous' }).map((hit) => hit.id),
    [attachment.id],
  );
}

/** Yields to the event loop until `predicate` holds. */
async function waitUntil(predicate: PredicateFn, description: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await setImmediate();
  }
  assert.fail(`Timed out waiting for ${description}`);
}

/** A download that rejects with `error`. */
function failingDownload(error: Error): DownloadFn {
  return async () => {
    await Promise.resolve();
    throw error;
  };
}

describe('AttachmentSyncOrchestrator', () => {
  it('preserves indexed status when re-syncing an already-indexed attachment', async () => {
    await withTestIndex(async (testIndex) => {
      const attachment = makeAttachment({ id: '42' });
      const issue = makeIssue([attachment]);
      seedIndexedAttachment(testIndex, issue, attachment, 'previous content');

      // The planner returns skip(already_indexed): the row must not flip to SKIPPED.
      const report = await buildOrchestrator(testIndex, issue, { registry: textRegistry(true) }).run(RUN_OPTIONS);

      assertPreviousIndexKept(testIndex, attachment);
      assert.strictEqual(report.skipped, 1);
      assert.strictEqual(report.indexed, 0);
    });
  });

  it('counts planned downloads separately from skipped attachments in a dry run', async () => {
    await withTestIndex(async (testIndex) => {
      const downloadable = makeAttachment({ id: 'dry-download', filename: 'notes.txt', mimeType: 'text/plain' });
      const unsupported = makeAttachment({ id: 'dry-skip', filename: 'image.png', mimeType: 'image/png' });

      const report = await buildOrchestrator(testIndex, makeIssue([downloadable, unsupported])).run({
        ...RUN_OPTIONS,
        dryRun: true,
      });

      assert.strictEqual(report.plannedDownloads, 1);
      assert.strictEqual(report.skipped, 1);
      assert.strictEqual(report.indexed, 0);
      assert.strictEqual(report.failed, 0);
      assert.strictEqual(testIndex.repository.getAttachment(downloadable.id), undefined);
      assert.strictEqual(testIndex.repository.getAttachment(unsupported.id), undefined);
    });
  });

  it('rethrows unexpected download/index task failures instead of swallowing them', async () => {
    await withTestIndex(async (testIndex) => {
      const attachment = makeAttachment({ id: '99', filename: 'notes.txt', mimeType: 'text/plain' });
      const hardError = new Error('sqlite write failed');
      const orchestrator = buildOrchestrator(testIndex, makeIssue([attachment]), {
        download: async () => await Promise.resolve({ sha256: 'sha256-hard-failure', bytesWritten: 12, attempts: 1 }),
        indexer: {
          indexAttachment: async () => {
            await Promise.resolve();
            throw hardError;
          },
        } as unknown as AttachmentIndexer,
      });

      await assert.rejects(orchestrator.run(RUN_OPTIONS), (error: unknown): boolean => error === hardError);
    });
  });

  it('records 403 attachment downloads as skipped/forbidden', async () => {
    await withTestIndex(async (testIndex) => {
      const attachment = makeAttachment({ id: '403', filename: 'private.txt', mimeType: 'text/plain' });
      const orchestrator = buildOrchestrator(testIndex, makeIssue([attachment]), {
        download: failingDownload(
          new GOFileDownloaderError('Download failed: HTTP 403 Forbidden', attachment.contentUrl, 1, 403),
        ),
      });

      const report = await orchestrator.run(RUN_OPTIONS);

      const row = testIndex.repository.getAttachment(attachment.id);
      assert.strictEqual(report.skipped, 1);
      assert.strictEqual(report.failed, 0);
      assert.strictEqual(report.errors.length, 0);
      assert.strictEqual(row?.status, AttachmentSyncStatus.SKIPPED);
      assert.strictEqual(row?.statusReason, AttachmentSkipReason.FORBIDDEN);
    });
  });

  describe('keeps a previous indexed document searchable when a forced refresh', () => {
    const cases: ReadonlyArray<{
      readonly title: string;
      readonly download: DownloadFn;
      readonly indexer?: IndexerFactoryFn;
      readonly expected: Pick<AttachmentSyncReport, 'failed' | 'skipped'>;
    }> = [
      {
        title: 'cannot download the attachment',
        download: failingDownload(new Error('network timeout')),
        expected: { failed: 1, skipped: 0 },
      },
      {
        title: 'cannot extract the downloaded file',
        // The real indexer finds no file in the cache directory and fails to extract.
        download: async () => await Promise.resolve({ sha256: 'sha256-new', bytesWritten: 12, attempts: 1 }),
        indexer: ({ index, repository }, registry) =>
          new AttachmentIndexer({ registry, index, repository, keepRaw: false }),
        expected: { failed: 1, skipped: 0 },
      },
      {
        title: 'is forbidden',
        download: failingDownload(
          new GOFileDownloaderError('Download failed: HTTP 401 Unauthorized', 'https://example.invalid/x', 1, 401),
        ),
        expected: { failed: 0, skipped: 1 },
      },
    ];

    for (const { title, download, indexer, expected } of cases) {
      it(title, async () => {
        await withTestIndex(async (testIndex) => {
          const attachment = makeAttachment({ id: '77', filename: 'notes.txt', mimeType: 'text/plain' });
          const issue = makeIssue([attachment]);
          seedIndexedAttachment(testIndex, issue, attachment, 'previous searchable content');
          const registry = textRegistry();

          const report = await buildOrchestrator(testIndex, issue, {
            download,
            registry,
            ...(indexer === undefined ? {} : { indexer: indexer(testIndex, registry) }),
          }).run({ ...RUN_OPTIONS, force: true });

          assert.strictEqual(report.failed, expected.failed);
          assert.strictEqual(report.skipped, expected.skipped);
          assert.strictEqual(report.indexed, 0);
          assertPreviousIndexKept(testIndex, attachment);
        });
      });
    }
  });

  it('does not queue every attachment before a download slot is available', async () => {
    await withTestIndex(async (testIndex) => {
      const attachments = ['a1', 'a2', 'a3'].map((id) =>
        makeAttachment({ id, filename: `${id}.txt`, mimeType: 'text/plain' }),
      );
      const started: string[] = [];
      const releases = new Map<string, () => void>();
      let activeDownloads = 0;
      let maxActiveDownloads = 0;

      const orchestrator = buildOrchestrator(testIndex, makeIssue(attachments), {
        download: async (attachment) => {
          started.push(attachment.id);
          activeDownloads += 1;
          maxActiveDownloads = Math.max(maxActiveDownloads, activeDownloads);
          return await new Promise<FakeDownload>((resolve) => {
            releases.set(attachment.id, () => {
              activeDownloads -= 1;
              resolve({ sha256: `sha256-${attachment.id}`, bytesWritten: 1, attempts: 1 });
            });
          });
        },
        indexer: {
          indexAttachment: async () =>
            await Promise.resolve({
              status: AttachmentSyncStatus.INDEXED,
              statusReason: null,
              preservedExistingIndex: false,
            }),
        } as unknown as AttachmentIndexer,
      });

      const runPromise = orchestrator.run({ ...RUN_OPTIONS, maxParallelDownloads: 2 });

      await waitUntil(() => started.length === 2, 'first two downloads to start');
      assert.deepStrictEqual(started, ['a1', 'a2']);

      releases.get('a1')?.();
      await waitUntil(() => started.length === 3, 'third download to start after a slot is released');
      assert.deepStrictEqual(started, ['a1', 'a2', 'a3']);

      releases.get('a2')?.();
      releases.get('a3')?.();
      const report = await runPromise;
      assert.strictEqual(maxActiveDownloads, 2);
      assert.strictEqual(report.indexed, 3);
    });
  });
});
