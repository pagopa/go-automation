/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface GoReportErrorPatternsConfig {
  /** AWS profile names (optional if specified in config file) */
  readonly awsProfiles?: ReadonlyArray<string> | undefined;
  /** Path to the JSON configuration file */
  readonly configFile: string;
}
