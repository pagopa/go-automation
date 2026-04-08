/**
 * Functions that build AttachmentDownloadTask arrays from different input formats.
 */

import path from 'path';

import { SafeStorageS3Client } from './SafeStorageS3Client.js';
import type { Attachment } from '../types/Attachment.js';
import type { AttachmentDownloadTask } from '../types/AttachmentDownloadTask.js';

// ============================================================================
// JSONL record shape (partial – only the fields we need)
// ============================================================================

interface PaperProgrStatus {
  readonly attachments: ReadonlyArray<Attachment>;
}

interface EventEntry {
  readonly paperProgrStatus: PaperProgrStatus | null;
}

interface ItemRecord {
  readonly eventsList: ReadonlyArray<EventEntry>;
}

export interface JsonlRecord {
  readonly keyValue: string;
  readonly items: ReadonlyArray<ItemRecord>;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Sanitizes a string so it can be safely used as a file-system folder name.
 *
 * @param name - Raw folder name candidate
 * @returns Safe folder name
 */
function sanitizeFolderName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_');
}

// ============================================================================
// Task builders
// ============================================================================

/**
 * Builds download tasks from a plain URI list (one safestorage:// per line).
 *
 * Complexity: O(N) where N is the number of URIs.
 *
 * @param uris - List of Safe Storage URI strings
 * @param baseOutputDir - Root output directory for this execution
 * @returns Array of download tasks, one per valid URI
 */
export function buildTasksFromUriList(
  uris: ReadonlyArray<string>,
  baseOutputDir: string,
): ReadonlyArray<AttachmentDownloadTask> {
  const tasks: AttachmentDownloadTask[] = [];

  for (const uri of uris) {
    if (!SafeStorageS3Client.isSafeStorageUri(uri)) {
      continue;
    }

    tasks.push({
      uri,
      key: SafeStorageS3Client.extractKey(uri),
      outputDir: baseOutputDir,
    });
  }

  return tasks;
}

/**
 * Extracts all attachments from a JSONL record and builds download tasks.
 * Each record's attachments are placed in a sub-folder named after `keyValue`.
 *
 * Complexity: O(I x E x A) where I = items, E = events, A = attachments per event.
 *
 * @param record - Parsed JSONL record
 * @param baseOutputDir - Root output directory for this execution
 * @returns Array of download tasks for all attachments in the record
 */
export function buildTasksFromJsonlRecord(
  record: JsonlRecord,
  baseOutputDir: string,
): ReadonlyArray<AttachmentDownloadTask> {
  const tasks: AttachmentDownloadTask[] = [];
  const subDir = path.join(baseOutputDir, sanitizeFolderName(record.keyValue));

  for (const item of record.items) {
    for (const event of item.eventsList) {
      const attachments = event.paperProgrStatus?.attachments ?? [];

      for (const attachment of attachments) {
        if (!SafeStorageS3Client.isSafeStorageUri(attachment.uri)) {
          continue;
        }

        tasks.push({
          uri: attachment.uri,
          key: SafeStorageS3Client.extractKey(attachment.uri),
          outputDir: subDir,
          documentType: attachment.documentType,
          sha256: attachment.sha256,
          keyValue: record.keyValue,
        });
      }
    }
  }

  return tasks;
}
