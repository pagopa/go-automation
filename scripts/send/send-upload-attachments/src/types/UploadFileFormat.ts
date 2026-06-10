/**
 * File formats supported for the input and output files
 */
export type UploadFileFormat = 'csv' | 'json' | 'jsonl';

/** Tuple of all supported file format values */
export const UPLOAD_FILE_FORMATS: ReadonlyArray<UploadFileFormat> = ['csv', 'json', 'jsonl'];

/**
 * Type guard for UploadFileFormat
 *
 * @param value - String to check
 * @returns True if the value is a supported file format
 */
export function isUploadFileFormat(value: string): value is UploadFileFormat {
  return (UPLOAD_FILE_FORMATS as ReadonlyArray<string>).includes(value);
}
