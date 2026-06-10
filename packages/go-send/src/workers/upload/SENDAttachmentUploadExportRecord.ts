/**
 * Export record builder for the attachment upload worker
 */

import type { SENDAttachmentUploadedFile } from './SENDAttachmentUploadedFile.js';

/**
 * Outcome of a processed row, used to build its export record
 */
export interface SENDAttachmentUploadExportOutcome {
  /** Row outcome */
  status: 'uploaded' | 'failed';
  /** Upload information (present when status is 'uploaded') */
  upload?: SENDAttachmentUploadedFile | undefined;
  /** Error message (present when status is 'failed') */
  errorMessage?: string | undefined;
}

/**
 * Builds the export record for a processed row: all the input fields first,
 * then the generated upload fields.
 *
 * The generated fields are always present (empty string placeholders when a
 * value is not available) so every record of a run shares the same key set —
 * a requirement for the CSV stream exporter, which derives the header from
 * the first appended record. Generated fields are spread last, so they win
 * over input fields with the same name.
 *
 * Input fields are taken from `_originalRow` when present (CSV importers
 * with preserveOriginalData), otherwise from the row object itself
 * (JSON/JSONL inputs and raw records from import errors).
 *
 * @param inputData - The typed row or the raw record for rows that failed import
 * @param outcome - Upload outcome for the row
 * @returns Flat record ready for the CSV/JSON exporters
 */
export function buildUploadExportRecord(
  inputData: unknown,
  outcome: SENDAttachmentUploadExportOutcome,
): Record<string, unknown> {
  return {
    ...extractInputFields(inputData),
    status: outcome.status,
    fileKey: outcome.upload?.fileKey ?? '',
    versionToken: outcome.upload?.versionToken ?? '',
    sha256: outcome.upload?.sha256 ?? '',
    fileSizeBytes: outcome.upload?.fileSizeBytes ?? '',
    contentType: outcome.upload?.contentType ?? '',
    uploadedAt: outcome.upload?.uploadedAt ?? '',
    error: outcome.errorMessage ?? '',
  };
}

/**
 * Extracts the input fields of a row, preferring the original raw record
 */
function extractInputFields(inputData: unknown): Record<string, unknown> {
  if (inputData === null || typeof inputData !== 'object') {
    return {};
  }

  const record = inputData as Record<string, unknown>;
  const originalRow = record['_originalRow'];
  if (originalRow !== null && typeof originalRow === 'object') {
    return { ...(originalRow as Record<string, unknown>) };
  }

  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key !== '_originalRow') {
      fields[key] = value;
    }
  }
  return fields;
}
