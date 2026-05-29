/**
 * Implements the `--action sync` flow.
 *
 * Wires together: resolve dirs → open index → build Jira client + registry
 * → run AttachmentSyncOrchestrator → print report.
 */
import { Core } from '@go-automation/go-common';

import { IssueDiscovery } from '../discovery/IssueDiscovery.js';
import { AttachmentCachePaths } from '../sync/AttachmentCachePaths.js';
import { AttachmentIndexer } from '../sync/AttachmentIndexer.js';
import { AttachmentSyncOrchestrator, type SyncProgressSnapshot } from '../sync/AttachmentSyncOrchestrator.js';
import { AttachmentRepository } from '../storage/AttachmentRepository.js';
import { closeIndex, openIndex } from '../storage/IndexLifecycle.js';
import type { AttachmentSyncReport } from '../types/AttachmentSyncReport.js';
import type { GoSearchJiraConfig } from '../types/GoSearchJiraConfig.js';

import { buildExtractorRegistry } from './buildExtractorRegistry.js';
import { buildJiraClient } from './buildJiraClient.js';
import { resolveDataDir } from './resolveDataDir.js';

const SPINNER_THROTTLE_MS = 100;

export class SyncCommand {
  public async execute(script: Core.GOScript, config: GoSearchJiraConfig): Promise<void> {
    const dataDir = resolveDataDir(script, config.storageDataDir);
    script.logger.section('Sync');
    script.logger.info(`Data dir: ${dataDir}`);

    if (config.jiraJql.length === 0 && config.jiraIssueKeys.length === 0) {
      script.logger.error('Provide --jira-jql or --jira-issue-keys.');
      throw new Error('Sync called without a discovery source');
    }
    const maxAttachmentSizeBytes = config.syncMaxAttachmentSizeMb * 1024 * 1024;

    const index = await openIndex({ dataDir, indexFileName: config.storageIndexFileName });
    let spinnerActive = false;
    try {
      const repository = new AttachmentRepository(index);
      const registry = buildExtractorRegistry();
      const client = buildJiraClient(config);
      const discovery = new IssueDiscovery(client);
      const cachePaths = new AttachmentCachePaths(dataDir);
      const indexer = new AttachmentIndexer({
        registry,
        index,
        repository,
        keepRaw: config.syncKeepRaw,
      });

      // Throttled spinner update — the orchestrator emits progress on every
      // attachment, which on large syncs is hundreds of events per second.
      let lastUpdateAt = 0;
      const onProgress = (snapshot: SyncProgressSnapshot): void => {
        if (!spinnerActive) return;
        const now = Date.now();
        if (now - lastUpdateAt < SPINNER_THROTTLE_MS) return;
        lastUpdateAt = now;
        script.prompt.updateSpinner(formatProgress(snapshot));
      };

      const orchestrator = new AttachmentSyncOrchestrator({
        logger: script.logger,
        index,
        repository,
        registry,
        client,
        discovery,
        indexer,
        cachePaths,
        onProgress,
      });

      script.prompt.startSpinner('Discovering Jira issues…');
      spinnerActive = true;
      let report;
      try {
        report = await orchestrator.run({
          jql: config.jiraJql,
          issueKeys: config.jiraIssueKeys,
          maxParallelDownloads: config.syncMaxParallelDownloads,
          maxAttachmentSizeBytes,
          dryRun: config.syncDryRun,
          force: config.syncForce,
        });
        spinnerActive = false;
        script.prompt.spinnerSucceed(formatCompletionMessage(report, config.syncDryRun));
      } catch (error) {
        spinnerActive = false;
        script.prompt.spinnerFail('Sync failed');
        throw error;
      }

      script.logger.section('Sync report');
      script.logger.info(`Issues processed: ${report.issuesProcessed}`);
      if (config.syncDryRun) {
        script.logger.info(`Planned downloads: ${report.plannedDownloads}`);
      }
      script.logger.info(`Indexed:          ${report.indexed}`);
      script.logger.info(`Skipped:          ${report.skipped}`);
      script.logger.info(`Failed:           ${report.failed}`);
      script.logger.info(`Bytes downloaded: ${Core.formatBytes(report.bytesDownloaded, { scaledFractionDigits: 1 })}`);
      script.logger.info(`Duration:         ${report.durationMs}ms`);

      if (config.syncDryRun) {
        script.logger.info('Dry-run mode: no downloads, no writes to the FTS index or the bookkeeping tables.');
      }

      if (report.errors.length > 0) {
        script.logger.warning(`Errors (${report.errors.length}):`);
        for (const error of report.errors.slice(0, 10)) {
          script.logger.text(`  • [${error.issueKey}] attachment ${error.attachmentId}: ${error.message}`);
        }
        if (report.errors.length > 10) {
          script.logger.text(`  … and ${report.errors.length - 10} more`);
        }
      }
    } finally {
      // Defensive: if anything before the spinnerSucceed/spinnerFail path
      // crashed (e.g. config validation), make sure the spinner is stopped.
      if (spinnerActive) {
        script.prompt.stopSpinner();
      }
      await closeIndex(index);
    }
  }
}

function formatProgress(snapshot: SyncProgressSnapshot): string {
  const inFlight = snapshot.inFlightDownloads > 0 ? ` · ${snapshot.inFlightDownloads} downloading` : '';
  const planned = snapshot.plannedDownloads > 0 ? `planned: ${snapshot.plannedDownloads}, ` : '';
  return `Issue ${snapshot.currentIssueKey} (processed: ${snapshot.issuesProcessed}, ${planned}indexed: ${snapshot.indexed}, skipped: ${snapshot.skipped}, failed: ${snapshot.failed}, ${Core.formatBytes(snapshot.bytesDownloaded, { scaledFractionDigits: 1 })}${inFlight})`;
}

function formatCompletionMessage(
  report: Pick<AttachmentSyncReport, 'indexed' | 'plannedDownloads' | 'skipped' | 'failed'>,
  dryRun: boolean,
): string {
  if (dryRun) {
    return `Dry-run complete: ${report.plannedDownloads} planned downloads, ${report.skipped} skipped, ${report.failed} failed`;
  }
  return `Sync complete: ${report.indexed} indexed, ${report.skipped} skipped, ${report.failed} failed`;
}
