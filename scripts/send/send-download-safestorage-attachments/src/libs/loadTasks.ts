/**
 * Input loading: reads URI-list or JSONL files and produces download tasks.
 */

import { Core } from '@go-automation/go-common';

import { SafeStorageS3Client } from './SafeStorageS3Client.js';
import { buildTasksFromUriList, buildTasksFromJsonlRecord } from './taskBuilders.js';
import type { JsonlRecord } from './taskBuilders.js';
import type { DownloadSafestorageAttachmentsConfig, InputMode } from '../types/DownloadSafestorageAttachmentsConfig.js';
import type { AttachmentDownloadTask } from '../types/AttachmentDownloadTask.js';

/**
 * Loads download tasks from a plain URI list file.
 *
 * @param inputFile - Path to the URI list file
 * @param baseOutputDir - Root output directory
 * @param prompt - GOPrompt for spinner feedback
 * @returns Array of resolved download tasks
 */
async function loadTasksFromUriList(
  inputFile: string,
  baseOutputDir: string,
  prompt: Core.GOPrompt,
): Promise<ReadonlyArray<AttachmentDownloadTask>> {
  const importer = new Core.GOFileListImporter<string>({
    trim: true,
    skipEmptyLines: true,
    commentPrefix: '#',
    deduplicate: true,
    rowValidator: (line) => {
      if (!SafeStorageS3Client.isSafeStorageUri(line)) {
        throw new Error(`Not a Safe Storage URI: ${line}`);
      }
    },
    skipInvalidItems: true,
  });

  importer.on('import:started', (event) => {
    prompt.spinLog(`Importing URI list from: ${event.source}`);
  });

  importer.on('import:completed', (event) => {
    prompt.spinSucceed('import', `URI list imported: ${event.totalItems} URIs (${event.duration}ms)`);
  });

  const result = await importer.import(inputFile);
  return buildTasksFromUriList(result.items, baseOutputDir);
}

/**
 * Loads download tasks from a JSONL file.
 * Each JSONL row must contain a `keyValue` field and nested `items` with `eventsList`.
 *
 * @param inputFile - Path to the JSONL file
 * @param baseOutputDir - Root output directory
 * @param prompt - GOPrompt for spinner feedback
 * @returns Array of resolved download tasks (one per attachment across all records)
 */
async function loadTasksFromJsonl(
  inputFile: string,
  baseOutputDir: string,
  prompt: Core.GOPrompt,
): Promise<ReadonlyArray<AttachmentDownloadTask>> {
  const importer = new Core.GOJSONListImporter<JsonlRecord>({
    jsonl: true,
    skipInvalidItems: true,
  });

  importer.on('import:started', (event) => {
    prompt.spinLog(`Importing JSONL from: ${event.source}`);
  });

  importer.on('import:completed', (event) => {
    prompt.spinSucceed('import', `JSONL imported: ${event.totalItems} records (${event.duration}ms)`);
  });

  const result = await importer.import(inputFile);

  const allTasks: AttachmentDownloadTask[] = [];
  for (const record of result.items) {
    for (const task of buildTasksFromJsonlRecord(record, baseOutputDir)) {
      allTasks.push(task);
    }
  }

  return allTasks;
}

/**
 * Loads download tasks from the input file according to the configured mode.
 *
 * @param config - Script configuration
 * @param inputFilePath - Resolved absolute path to the input file
 * @param baseOutputDir - Root output directory for this execution
 * @param prompt - GOPrompt for spinner feedback
 * @returns Array of resolved download tasks
 */
export async function loadTasks(
  config: DownloadSafestorageAttachmentsConfig,
  inputFilePath: string,
  baseOutputDir: string,
  prompt: Core.GOPrompt,
): Promise<ReadonlyArray<AttachmentDownloadTask>> {
  const mode: InputMode = config.inputMode;

  switch (mode) {
    case 'uri-list':
      return loadTasksFromUriList(inputFilePath, baseOutputDir, prompt);
    case 'jsonl':
      return loadTasksFromJsonl(inputFilePath, baseOutputDir, prompt);
    default: {
      const exhaustive: never = mode;
      throw new Error(`Unknown input mode: ${String(exhaustive)}`);
    }
  }
}
