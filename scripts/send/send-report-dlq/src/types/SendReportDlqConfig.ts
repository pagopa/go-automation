import type { Core } from '@go-automation/go-common';

/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface SendReportDlqConfig {
  /** AWS SSO profile names */
  readonly awsProfiles: ReadonlyArray<string>;

  /** Optional output file path (absolute or relative to output directory) */
  readonly outputFile: string;

  /** Output format */
  readonly outputFormat: Core.GOExportFormat;
}
