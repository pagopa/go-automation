/**
 * Sequential download execution with progress reporting.
 */

import path from 'path';

import { Core } from '@go-automation/go-common';
import type { SENDSafeStorageS3Service } from '@go-automation/go-send';

import type { AttachmentDownloadTask } from '../types/AttachmentDownloadTask.js';
import type { DownloadResult } from '../types/DownloadResult.js';

/**
 * Downloads a single attachment to disk and maps the outcome to a report entry.
 * Errors are captured in the result instead of being thrown.
 *
 * @param task - The download task descriptor
 * @param safeStorage - SENDSafeStorageS3Service instance
 * @returns Download result with success flag and output path or error message
 */
async function downloadAttachment(
  task: AttachmentDownloadTask,
  safeStorage: SENDSafeStorageS3Service,
): Promise<DownloadResult> {
  const taskMetadata = {
    ...(task.documentType !== undefined && { documentType: task.documentType }),
    ...(task.sha256 !== undefined && { sha256: task.sha256 }),
    ...(task.keyValue !== undefined && { keyValue: task.keyValue }),
  };

  try {
    const outputPath = await safeStorage.downloadToFile(task.key, path.join(task.outputDir, task.key));
    return { uri: task.uri, key: task.key, outputPath, success: true, ...taskMetadata };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { uri: task.uri, key: task.key, success: false, error: errorMessage, ...taskMetadata };
  }
}

/**
 * Runs all download tasks sequentially and reports progress.
 *
 * @param tasks - Tasks to execute
 * @param safeStorage - SENDSafeStorageS3Service instance
 * @param prompt - GOPrompt for spinner feedback
 * @returns Array of download results
 */
export async function runDownloads(
  tasks: ReadonlyArray<AttachmentDownloadTask>,
  safeStorage: SENDSafeStorageS3Service,
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

    const result = await downloadAttachment(task, safeStorage);
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
