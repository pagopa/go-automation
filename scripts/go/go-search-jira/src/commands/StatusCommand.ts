/**
 * Implements the `--action status` flow.
 *
 * Designed to work even when no index has been built yet (the very first
 * acceptance criterion): in that case it reports "no index" and exits cleanly
 * without reaching out to Jira.
 */
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { Core } from '@go-automation/go-common';

import { AttachmentRepository } from '../storage/AttachmentRepository.js';
import { closeIndex, openIndex } from '../storage/IndexLifecycle.js';
import type { GoSearchJiraConfig } from '../types/GoSearchJiraConfig.js';

export class StatusCommand {
  public async execute(script: Core.GOScript, config: GoSearchJiraConfig): Promise<void> {
    const dataDir =
      config.storageDataDir.length > 0
        ? script.paths.resolvePathWithInfo(config.storageDataDir, Core.GOPathType.OUTPUT).path
        : script.paths.getDataDir();
    const dbPath = path.join(dataDir, config.storageIndexFileName);

    script.logger.section('Status');
    script.logger.info(`Data dir:    ${dataDir}`);
    script.logger.info(`Index file:  ${dbPath}`);

    if (!(await fileExists(dbPath))) {
      script.logger.warning('No index found yet. Run `--action sync` to create one.');
      return;
    }

    const index = await openIndex({
      dataDir,
      indexFileName: config.storageIndexFileName,
      readonly: true,
    });
    try {
      const stats = index.stats();
      script.logger.info(`Index size:        ${formatBytes(stats.databaseSizeBytes)}`);
      script.logger.info(`Tokenizer:         ${stats.tokenizer}`);
      script.logger.info(`Indexed documents: ${stats.documentCount}`);

      const repository = new AttachmentRepository(index);
      const breakdown = repository.statusBreakdown();
      script.logger.info(
        `Attachments:       ${breakdown.indexed} indexed | ${breakdown.skipped} skipped | ${breakdown.failed} failed | ${breakdown.deleted} deleted`,
      );
      script.logger.info(`Issues:            ${repository.countIssues()}`);

      const lastSync = repository.getLastSync();
      script.logger.info(`Last sync:         ${lastSync ?? 'never'}`);

      const mimeTypes = repository.mimeTypeBreakdown();
      if (mimeTypes.length > 0) {
        script.logger.section('By MIME type');
        for (const row of mimeTypes) {
          script.logger.text(`  ${row.mimeType.padEnd(60)} ${row.count}`);
        }
      }

      const skipReasons = repository.skipReasonBreakdown();
      if (skipReasons.length > 0) {
        script.logger.section('Skip reasons');
        for (const row of skipReasons) {
          script.logger.text(`  ${row.reason.padEnd(30)} ${row.count}`);
        }
      }

      const skipMimes = repository.skipMimeBreakdown();
      if (skipMimes.length > 0) {
        script.logger.section('Skipped attachments by MIME type');
        for (const row of skipMimes) {
          const mime = row.mimeType.length > 0 ? row.mimeType : '(empty)';
          script.logger.text(`  [${row.reason}] ${mime.padEnd(60)} ${row.count}`);
        }
      }
    } finally {
      await closeIndex(index);
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}
