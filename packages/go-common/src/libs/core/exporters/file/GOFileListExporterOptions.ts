/**
 * File List Exporter Options
 */

export interface GOFileListExporterOptions {
  /** Output file path */
  outputPath: string;

  /** File encoding (default: utf8) */
  encoding?: BufferEncoding;

  /** Skip invalid items instead of throwing errors */
  skipInvalidItems?: boolean;

  /** Line separator (default: \n) */
  lineSeparator?: string;
}
