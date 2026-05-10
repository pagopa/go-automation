/**
 * Implements the `--action clean` flow.
 *
 *   default        → removes index.db and the attachments cache
 *   --raw-only     → only removes the cached binaries (keeps index.db)
 *   --yes          → skips the interactive confirmation
 *
 * The destructive action is performed atomically by renaming the database to a
 * `.bak.<ts>` sibling first, deleting the cache, then unlinking the backup.
 * If the process is killed mid-cleanup, the `.bak` file remains for recovery.
 */
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { Core } from '@go-automation/go-common';

import { AttachmentCachePaths } from '../sync/AttachmentCachePaths.js';
import type { GoSearchJiraConfig } from '../types/GoSearchJiraConfig.js';

export class CleanCommand {
  public async execute(script: Core.GOScript, config: GoSearchJiraConfig): Promise<void> {
    const dataDir =
      config.storageDataDir.length > 0
        ? script.paths.resolvePathWithInfo(config.storageDataDir, Core.GOPathType.OUTPUT).path
        : script.paths.getDataDir();
    const dbPath = path.join(dataDir, config.storageIndexFileName);
    const cachePaths = new AttachmentCachePaths(dataDir);
    const attachmentsRoot = cachePaths.attachmentsRoot();

    script.logger.section('Clean');
    if (!config.cleanYes) {
      // Print the targets on their own lines so the confirmation prompt that
      // follows is short and inquirer can render the cursor cleanly without
      // wrapping at the terminal width.
      if (config.cleanRawOnly) {
        script.logger.info(`Cached attachments: ${attachmentsRoot}`);
      } else {
        script.logger.info(`Index file:         ${dbPath}`);
        script.logger.info(`Cached attachments: ${attachmentsRoot}`);
      }
      const message = config.cleanRawOnly ? 'Delete cached attachments?' : 'Delete index AND cached attachments?';
      const confirmed = await script.prompt.confirm(message, false);
      if (confirmed !== true) {
        script.logger.info('Aborted.');
        return;
      }
    }

    if (config.cleanRawOnly) {
      await this.removeDirectory(attachmentsRoot, script.logger);
      script.logger.info('Cached attachments removed. Index left untouched.');
      return;
    }

    await this.removeIndexAtomically(dbPath, script.logger);
    await this.removeDirectory(attachmentsRoot, script.logger);
    script.logger.info('Index and cache removed. Run `--action sync` to recreate.');
  }

  private async removeIndexAtomically(dbPath: string, logger: Core.GOLogger): Promise<void> {
    if (!(await fileExists(dbPath))) {
      logger.text(`No index file at ${dbPath}; nothing to remove.`);
      // Still clean up WAL/SHM siblings if they happen to exist
      await this.bestEffortUnlink(`${dbPath}-wal`);
      await this.bestEffortUnlink(`${dbPath}-shm`);
      return;
    }
    const backupPath = `${dbPath}.bak.${Date.now()}`;
    // The paths are derived from the user's storage.data.dir + storage.index.file.name
    // configuration; this is the intended behaviour of the `clean` action.
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- intentional: cleans configurable cache path
    await fs.rename(dbPath, backupPath);
    await this.bestEffortUnlink(`${dbPath}-wal`);
    await this.bestEffortUnlink(`${dbPath}-shm`);
    await this.bestEffortUnlink(backupPath);
    logger.text(`Removed ${dbPath}`);
  }

  private async removeDirectory(dir: string, logger: Core.GOLogger): Promise<void> {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      logger.text(`Removed ${dir}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      logger.warning(`Failed to remove ${dir}: ${message}`);
    }
  }

  private async bestEffortUnlink(filePath: string): Promise<void> {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- intentional: removes a known sibling of the configured index file
      await fs.unlink(filePath);
    } catch {
      /* ignore */
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
