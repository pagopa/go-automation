/**
 * Importer factory for the upload input file
 *
 * Creates the appropriate go-common list importer based on the input format.
 */

import { Core } from '@go-automation/go-common';
import type { SENDAttachmentUploadRow } from '@go-automation/go-send';

import type { UploadFileFormat } from '../types/index.js';

/**
 * Validates that a raw CSV record has a non-empty filePath column
 */
function validateCsvRecord(record: Record<string, string>): void {
  const filePath = record['filePath'];
  if (filePath === undefined || filePath.trim() === '') {
    throw new Error("missing or empty 'filePath' column");
  }
}

/**
 * Maps a raw CSV record (string values) into a typed upload row
 */
function transformCsvRecord(record: Record<string, string>): SENDAttachmentUploadRow {
  const row: Record<string, unknown> = { ...record };
  row['filePath'] = (record['filePath'] ?? '').trim(); // Safe: validated before transform

  const contentType = (record['contentType'] ?? '').trim();
  if (contentType === '') {
    // An empty contentType column must not override extension inference
    delete row['contentType'];
  } else {
    row['contentType'] = contentType;
  }

  return row as SENDAttachmentUploadRow;
}

/**
 * Validates that a JSON item is an object with a non-empty filePath field
 */
function validateJsonItem(item: unknown): void {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('row must be a JSON object');
  }
  const filePath = (item as Record<string, unknown>)['filePath'];
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new Error("missing or empty 'filePath' field");
  }
}

/**
 * Maps a raw JSON item into a typed upload row
 */
function transformJsonItem(item: unknown): SENDAttachmentUploadRow {
  const record = item as Record<string, unknown>; // Safe: validated before transform
  const row: Record<string, unknown> = { ...record };
  row['filePath'] = (record['filePath'] as string).trim();

  const contentType = record['contentType'];
  if (typeof contentType !== 'string' || contentType.trim() === '') {
    delete row['contentType'];
  } else {
    row['contentType'] = contentType.trim();
  }

  return row as SENDAttachmentUploadRow;
}

/**
 * Creates the list importer for the input file
 *
 * The importer is configured with `skipInvalidItems` equal to `skipOnError`,
 * as required by SENDAttachmentUploadWorker: invalid input rows follow the
 * same skip/stop semantics as upload failures.
 *
 * @param format - Input file format
 * @param skipOnError - Skip-on-error flag of the script
 * @returns Importer yielding typed upload rows
 */
export function createImporter(
  format: UploadFileFormat,
  skipOnError: boolean,
): Core.GOListImporter<SENDAttachmentUploadRow> {
  switch (format) {
    case 'csv':
      return new Core.GOCSVListImporter<SENDAttachmentUploadRow>({
        preserveOriginalData: true,
        skipInvalidItems: skipOnError,
        rowValidator: validateCsvRecord,
        rowTransformer: transformCsvRecord,
      });

    case 'json':
    case 'jsonl':
      return new Core.GOJSONListImporter<SENDAttachmentUploadRow>({
        jsonl: format === 'jsonl' ? true : 'auto',
        skipInvalidItems: skipOnError,
        rowValidator: validateJsonItem,
        rowTransformer: transformJsonItem,
      });

    default: {
      const exhaustiveCheck: never = format;
      throw new Error(`Unhandled input format: ${String(exhaustiveCheck)}`);
    }
  }
}
