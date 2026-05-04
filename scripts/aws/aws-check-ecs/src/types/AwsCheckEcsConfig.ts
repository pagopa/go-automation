/**
 * AwsCheckEcsConfig - Interface for AWS Check ECS script configuration.
 *
 * This interface defines the configuration parameters for the aws-check-ecs script,
 * including AWS account, region and cluster details.
 */

export interface AwsCheckEcsConfig {
  /**
   * The AWS SSO profile name to use for authentication.
   * @type {string}
   */
  readonly awsProfiles: ReadonlyArray<string>;

  /**
   * The AWS region to use for authentication.
   * @type {string}
   */
  readonly awsRegion: string;

  /**
   * Array of ECS cluster names to check.
   * If not provided, all clusters in the region will be checked.
   * @type {ReadonlyArray<string>}
   */
  readonly ecsClusters?: ReadonlyArray<string>;
}
