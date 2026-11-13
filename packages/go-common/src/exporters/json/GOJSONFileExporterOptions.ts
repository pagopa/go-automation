/**
 * Options for the single-object JSON file exporter
 */
export interface GOJSONFileExporterOptions {
  /** Output file path */
  readonly outputPath: string;

  /** Pretty print with indentation (default: true) */
  readonly pretty?: boolean;

  /** Indentation spaces when pretty is enabled (default: 2) */
  readonly indent?: number;

  /** Encoding for output file (default: 'utf-8') */
  readonly encoding?: BufferEncoding;
}
