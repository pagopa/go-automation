/**
 * Glues planner + downloader + indexer together to execute a full sync run.
 *
 * Concurrency model:
 *  - Issue iteration is sequential (one HTTP call at a time).
 *  - For each issue, attachments to download are scheduled on a
 *    `GOConcurrencyPool` with the configured limit.
 *  - Indexing happens inside the same task so a failure in one attachment
 *    cannot stall others.
 *
 * Resilience:
 *  - Per-attachment errors are captured in the report; the run continues.
 *  - Hard errors (auth, schema, IO) bubble up and abort the run.
 *  - On clean exit, performs a WAL checkpoint.
 */
import { Core } from '@go-automation/go-common';

import type { JiraClient } from '../jira/JiraClient.js';
import type { IssueDiscovery } from '../discovery/IssueDiscovery.js';
import type { AttachmentRepository } from '../storage/AttachmentRepository.js';
import { AttachmentCachePaths } from './AttachmentCachePaths.js';
import { AttachmentPlanner } from './AttachmentPlanner.js';
import type { AttachmentIndexer } from './AttachmentIndexer.js';
import { AttachmentSyncStatus } from '../types/AttachmentSyncStatus.js';
import type { AttachmentSyncReport } from '../types/AttachmentSyncReport.js';
import type { AttachmentPlanItem } from '../types/AttachmentPlanItem.js';
import type { JiraIssue } from '../types/JiraIssue.js';

export interface AttachmentSyncOrchestratorOptions {
  readonly jql: string;
  readonly issueKeys: ReadonlyArray<string>;
  readonly maxParallelDownloads: number;
  readonly maxAttachmentSizeBytes: number;
  readonly keepRaw: boolean;
  readonly dryRun: boolean;
  readonly force: boolean;
}

/**
 * Snapshot of the sync progress emitted while the orchestrator runs. Useful
 * to drive a CLI spinner, a progress bar or a structured log.
 */
export interface SyncProgressSnapshot {
  readonly currentIssueKey: string;
  readonly issuesProcessed: number;
  readonly indexed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly bytesDownloaded: number;
  readonly inFlightDownloads: number;
}

/**
 * Callback invoked by the orchestrator to report progress. The orchestrator
 * calls it at every issue boundary and after every download/extract attempt,
 * so the consumer should keep the implementation cheap (e.g. update an
 * in-place spinner string, not a synchronous I/O).
 */
type OnSyncProgressFn = (snapshot: SyncProgressSnapshot) => void;

export interface AttachmentSyncOrchestratorDeps {
  readonly logger: Core.GOLogger;
  readonly index: Core.GOFtsIndex;
  readonly repository: AttachmentRepository;
  readonly registry: Core.GOTextExtractorRegistry;
  readonly client: JiraClient;
  readonly discovery: IssueDiscovery;
  readonly indexer: AttachmentIndexer;
  readonly cachePaths: AttachmentCachePaths;
  readonly onProgress?: OnSyncProgressFn;
}

interface MutableReport {
  issuesProcessed: number;
  indexed: number;
  skipped: number;
  failed: number;
  deleted: number;
  bytesDownloaded: number;
  errors: { attachmentId: string; issueKey: string; message: string }[];
}

export class AttachmentSyncOrchestrator {
  constructor(private readonly deps: AttachmentSyncOrchestratorDeps) {}

  public async run(options: AttachmentSyncOrchestratorOptions): Promise<AttachmentSyncReport> {
    const startedAt = Date.now();
    const planner = new AttachmentPlanner();
    const pool = new Core.GOConcurrencyPool(options.maxParallelDownloads);
    const report: MutableReport = {
      issuesProcessed: 0,
      indexed: 0,
      skipped: 0,
      failed: 0,
      deleted: 0,
      bytesDownloaded: 0,
      errors: [],
    };

    const canExtract = (mimeType: string, filename: string): boolean =>
      this.deps.registry.canHandle(mimeType, filename);
    // Predicate name matches the planner contract: "already in the index".
    // Skipped/failed rows from previous runs must be retried, so we check the
    // explicit `indexed` status, not mere row presence.
    const hasInIndex = (attachmentId: string): boolean => this.deps.repository.isAttachmentIndexed(attachmentId);

    const plannerOptions = {
      force: options.force,
      maxAttachmentSizeBytes: options.maxAttachmentSizeBytes,
      canExtract,
      hasInIndex,
    };

    const inFlight: Promise<void>[] = [];

    for await (const issue of this.deps.discovery.discover({ jql: options.jql, issueKeys: options.issueKeys })) {
      report.issuesProcessed += 1;
      // Dry-run is side-effect free: count what would happen but do NOT touch
      // the issues / attachments / FTS tables. The bookkeeping write happens
      // only on real runs.
      if (!options.dryRun) {
        this.deps.repository.upsertIssue(issue, new Date().toISOString());
      }
      this.reportProgress(issue.key, report, pool);

      const decisions = planner.planForIssue(issue, plannerOptions);
      for (const decision of decisions) {
        if (decision.action === 'skip') {
          this.handleSkipDecision(issue, decision, report, options.dryRun);
          this.reportProgress(issue.key, report, pool);
          continue;
        }
        const task = pool.run(async () => {
          await this.processDownload(issue, decision, options, report);
          this.reportProgress(issue.key, report, pool);
        });
        inFlight.push(task);
      }
    }

    await Promise.allSettled(inFlight);
    await pool.drain();

    if (!options.dryRun) {
      this.deps.repository.setLastSync(new Date().toISOString());
      this.deps.index.checkpoint();
    }

    return {
      issuesProcessed: report.issuesProcessed,
      indexed: report.indexed,
      skipped: report.skipped,
      failed: report.failed,
      deleted: report.deleted,
      bytesDownloaded: report.bytesDownloaded,
      durationMs: Date.now() - startedAt,
      errors: report.errors.map((entry) => ({ ...entry })),
    };
  }

  private reportProgress(currentIssueKey: string, report: MutableReport, pool: Core.GOConcurrencyPool): void {
    if (this.deps.onProgress === undefined) return;
    this.deps.onProgress({
      currentIssueKey,
      issuesProcessed: report.issuesProcessed,
      indexed: report.indexed,
      skipped: report.skipped,
      failed: report.failed,
      bytesDownloaded: report.bytesDownloaded,
      inFlightDownloads: pool.activeCount,
    });
  }

  private handleSkipDecision(
    issue: JiraIssue,
    decision: Extract<AttachmentPlanItem, { action: 'skip' }>,
    report: MutableReport,
    dryRun: boolean,
  ): void {
    report.skipped += 1;
    if (dryRun) return;
    // Always upsert with the real issue metadata so summary / projectKey are
    // never lost — `upsertAttachmentMetadata` does INSERT ... ON CONFLICT and
    // refreshes those fields on every sync run.
    this.deps.repository.upsertAttachmentMetadata(
      issue,
      decision.attachment,
      AttachmentSyncStatus.SKIPPED,
      decision.reason,
      new Date().toISOString(),
    );
  }

  private async processDownload(
    issue: JiraIssue,
    decision: Extract<AttachmentPlanItem, { action: 'download' | 'force-download' }>,
    options: AttachmentSyncOrchestratorOptions,
    report: MutableReport,
  ): Promise<void> {
    const attachment = decision.attachment;
    const localPath = this.deps.cachePaths.attachmentPath(issue.key, attachment);
    const nowIso = new Date().toISOString();

    if (options.dryRun) {
      this.deps.logger.info(`[dry-run] would download ${issue.key} :: ${attachment.filename}`);
      // No DB write: dry-run is purely informational. Count via report only.
      report.skipped += 1;
      return;
    }

    let downloaded: { readonly sha256: string; readonly bytesWritten: number };
    try {
      downloaded = await this.deps.client.downloadAttachment(attachment, localPath);
      report.bytesDownloaded += downloaded.bytesWritten;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'download failed';
      this.deps.repository.upsertAttachmentMetadata(
        issue,
        attachment,
        AttachmentSyncStatus.FAILED,
        `download_error: ${message.slice(0, 240)}`,
        nowIso,
      );
      report.failed += 1;
      report.errors.push({ attachmentId: attachment.id, issueKey: issue.key, message });
      return;
    }

    // Indexer writes the final row state itself (INDEXED on success, FAILED
    // on extract error). No placeholder row exists before this point.
    await this.deps.indexer.indexAttachment({
      issue,
      attachment,
      localPath,
      contentHash: downloaded.sha256,
    });

    const refreshed = this.deps.repository.getAttachment(attachment.id);
    if (refreshed?.status === AttachmentSyncStatus.INDEXED) {
      report.indexed += 1;
    } else {
      report.failed += 1;
      report.errors.push({
        attachmentId: attachment.id,
        issueKey: issue.key,
        message: refreshed?.statusReason ?? 'unknown failure',
      });
    }
  }
}
