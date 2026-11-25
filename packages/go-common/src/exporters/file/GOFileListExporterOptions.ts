/**
 * File List Exporter Options
 */

export interface GOFileListExporterOptions {
  /** Output file path */
  readonly outputPath: string;

  /** File encoding (default: utf8) */
  readonly encoding?: BufferEncoding;

  /** Skip invalid items instead of throwing errors */
  readonly skipInvalidItems?: boolean;

  /** Line separator (default: \n) */
  readonly lineSeparator?: string;
}
