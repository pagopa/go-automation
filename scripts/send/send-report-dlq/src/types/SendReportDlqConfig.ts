/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface SendReportDlqConfig {
  /** AWS SSO profile names */
  readonly awsProfiles: ReadonlyArray<string>;

  /** Optional output file path (absolute or relative to output directory) */
  readonly outputFile: string;

  /** Output format: 'json' | 'csv' | 'html' (default: 'json') */
  readonly outputFormat: string;
}
