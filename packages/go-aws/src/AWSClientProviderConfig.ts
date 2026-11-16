/**
 * Configuration of the AWS clients bound to one profile.
 */
export interface AWSClientProviderConfig {
  /** AWS SSO profile name. When omitted, the SDK default credential chain is used. */
  readonly profile?: string;

  /** AWS region (defaults to eu-south-1) */
  readonly region?: string;
}
