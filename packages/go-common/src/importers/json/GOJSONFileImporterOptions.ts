/**
 * Options for the single-object JSON file importer
 */
export interface GOJSONFileImporterOptions {
  /** Input file path */
  readonly inputPath: string;

  /** Encoding for input file (default: 'utf-8') */
  readonly encoding?: BufferEncoding;

  /** If true, returns undefined instead of throwing when file does not exist (default: false) */
  readonly optional?: boolean;
}
