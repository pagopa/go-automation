/**
 * Sequential download execution with progress reporting.
 */

import { Core } from '@go-automation/go-common';

import { SafeStorageS3Client } from './SafeStorageS3Client.js';
import type { AttachmentDownloadTask } from '../types/AttachmentDownloadTask.js';
import type { DownloadResult } from '../types/DownloadResult.js';

/**
 * Runs all download tasks sequentially and reports progress.
 *
 * @param tasks - Tasks to execute
 * @param client - SafeStorageS3Client instance
 * @param prompt - GOPrompt for spinner feedback
 * @returns Array of download results
 */
export async function runDownloads(
  tasks: ReadonlyArray<AttachmentDownloadTask>,
  client: SafeStorageS3Client,
  prompt: Core.GOPrompt,
): Promise<ReadonlyArray<DownloadResult>> {
  const results: DownloadResult[] = [];
  let completed = 0;

  for (const task of tasks) {
    const percentage = Math.round((completed / tasks.length) * 100);
    prompt.spin(
      'downloading',
      `[${percentage}%] ${task.key}${task.keyValue !== undefined ? ` (${task.keyValue})` : ''}`,
    );

    const result = await client.download(task);
    results.push(result);
    completed += 1;

    if (result.success) {
      prompt.spinLog(`\x1b[32m✓\x1b[0m ${task.key}`);
    } else {
      prompt.spinLog(`\x1b[31m✗\x1b[0m ${task.key}: ${result.error ?? 'unknown error'}`);
    }
  }

  return results;
}
