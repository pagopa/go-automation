/**
 * Loader for send-upload-attachments results files
 *
 * Parses the output file (files-results.json) of the send-upload-attachments
 * script and groups the successfully uploaded attachments by `pratica`, so
 * the import worker can attach multiple documents to a single notification.
 */

import * as fs from 'fs/promises';

import type { SENDUploadedAttachment } from './SENDUploadedAttachment.js';
import type { SENDUploadedAttachmentSkipped } from './SENDUploadedAttachmentSkipped.js';
import type { SENDUploadedAttachmentsLoadResult } from './SENDUploadedAttachmentsLoadResult.js';

/** Default content type when the record does not provide one */
const DEFAULT_CONTENT_TYPE = 'application/pdf';

/**
 * Reads a record field as a trimmed string, returning an empty string when
 * the field is absent or not a string.
 */
function readStringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Loads the attachments uploaded by the send-upload-attachments script from
 * its results file (files-results.json) and groups them by `pratica`.
 *
 * Records that did not upload successfully (status !== 'uploaded') or that
 * miss required fields (pratica, fileKey, versionToken, sha256) are skipped
 * and reported in the result, so callers can warn about them.
 *
 * Upload concurrency does not guarantee a stable record order in the source
 * file, so each group is sorted by filePath to keep the document order
 * deterministic (the first document is the main act of the notification).
 *
 * Complexity: O(N log N) where N is the number of records (per-group sorting).
 *
 * @param filePath - Path of the results file produced by send-upload-attachments
 * @returns Attachments grouped by pratica plus skipped records information
 * @throws Error if the file cannot be read or does not contain a JSON array
 *
 * @example
 * ```typescript
 * const result = await loadUploadedAttachments('files-results.json');
 * const attachments = result.attachmentsByPratica.get('PRA-001');
 * ```
 */
export async function loadUploadedAttachments(filePath: string): Promise<SENDUploadedAttachmentsLoadResult> {
  const content = await fs.readFile(filePath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid attachments file (not valid JSON): ${filePath} - ${(error as Error).message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid attachments file (expected a JSON array): ${filePath}`);
  }

  const records: readonly unknown[] = parsed;
  const grouped = new Map<string, SENDUploadedAttachment[]>();
  const skipped: SENDUploadedAttachmentSkipped[] = [];
  let totalAttachments = 0;

  for (const item of records) {
    if (item === null || typeof item !== 'object') {
      skipped.push({ filePath: '', pratica: '', reason: 'Record is not an object' });
      continue;
    }

    const record = item as Record<string, unknown>;
    const recordFilePath = readStringField(record, 'filePath');
    const pratica = readStringField(record, 'pratica');
    const status = readStringField(record, 'status');

    if (status !== 'uploaded') {
      const error = readStringField(record, 'error');
      skipped.push({
        filePath: recordFilePath,
        pratica,
        reason: error !== '' ? `Upload failed: ${error}` : `Unexpected status: ${status !== '' ? status : '(empty)'}`,
      });
      continue;
    }

    const fileKey = readStringField(record, 'fileKey');
    const versionToken = readStringField(record, 'versionToken');
    const sha256 = readStringField(record, 'sha256');
    const contentType = readStringField(record, 'contentType');

    if (!pratica || !fileKey || !versionToken || !sha256) {
      skipped.push({
        filePath: recordFilePath,
        pratica,
        reason: 'Missing required fields (pratica, fileKey, versionToken, sha256)',
      });
      continue;
    }

    const attachment: SENDUploadedAttachment = {
      pratica,
      filePath: recordFilePath,
      fileKey,
      versionToken,
      sha256,
      contentType: contentType !== '' ? contentType : DEFAULT_CONTENT_TYPE,
    };

    const group = grouped.get(pratica);
    if (group) {
      group.push(attachment);
    } else {
      grouped.set(pratica, [attachment]);
    }
    totalAttachments++;
  }

  for (const group of grouped.values()) {
    group.sort((a, b) => a.filePath.localeCompare(b.filePath));
  }

  return { attachmentsByPratica: grouped, totalAttachments, skipped };
}
