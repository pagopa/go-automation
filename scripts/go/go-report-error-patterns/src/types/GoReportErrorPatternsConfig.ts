/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface GoReportErrorPatternsConfig {
  /** AWS profile names */
  readonly awsProfiles: ReadonlyArray<string>;
  /** Path to the JSON configuration file */
  readonly configFile: string;
}
