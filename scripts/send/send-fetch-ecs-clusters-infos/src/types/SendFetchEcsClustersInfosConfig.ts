/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface SendFetchEcsClustersInfosConfig {
  /** AWS profile name */
  readonly awsProfiles: ReadonlyArray<string>;
  readonly configFile: string;
}
