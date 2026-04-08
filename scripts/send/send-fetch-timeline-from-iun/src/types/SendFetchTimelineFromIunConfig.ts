/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface SendFetchTimelineFromIunConfig {
  /** AWS profile name for SSO authentication */
  readonly awsProfile: string;

  /** Input file path containing IUNs */
  readonly sourceFile: string;

  /** Output file path for JSON results */
  readonly destinationFile: string;
}
