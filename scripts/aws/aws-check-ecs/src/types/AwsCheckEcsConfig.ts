/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface AwsCheckEcsConfig {
  /** AWS profile name for SSO authentication */
  readonly awsProfile: string;

  /** AWS Region */
  readonly awsRegion: string;

  /** List of ECS clusters to check */
  readonly ecsClusters?: ReadonlyArray<string>;
}
