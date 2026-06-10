/**
 * Script configuration interface
 * Represents all validated configuration parameters (camelCase mapping)
 */
export interface SendUploadAttachmentsConfig {
  /** Path of the input file (csv, json or jsonl) */
  readonly inputFile: string;
  /** Path of the output file (default: <input>-results.<format>) */
  readonly outputFile?: string | undefined;
  /** Output format override: csv, json or jsonl */
  readonly outputFormat?: string | undefined;
  /** Base URL of the PN service */
  readonly basePath: string;
  /** API Key for PN authentication */
  readonly pnApiKey: string;
  /** Continue with the next files on error (false = stop at the first error) */
  readonly skipOnError: boolean;
  /** Number of parallel uploads */
  readonly concurrency: number;
  /** Content type used when not specified per row and not inferable from the extension */
  readonly defaultContentType?: string | undefined;
  /** Optional HTTP proxy URL for debugging */
  readonly proxyUrl?: string | undefined;
  /** Enable HTTP debug logging */
  readonly debug: boolean;
}
