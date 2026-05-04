/**
 * Configuration types for the AWS Check ECS script.
 */

export interface AwsCheckEcsConfig {
  /** AWS Profile for SSO login */
  readonly awsProfiles: ReadonlyArray<string>;

  /** AWS Region */
  readonly awsRegion: string;

  /** ECS Clusters to check */
  readonly ecsClusters?: ReadonlyArray<string>;
}
