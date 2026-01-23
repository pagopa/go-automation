/**
 * Configuration options for the AWS Athena Service
 */
export interface AthenaServiceOptions {
  /**
   * AWS SSO profile name (e.g., 'sso_pn-core-dev')
   * If null, uses default credentials chain
   */
  readonly ssoProfile: string | null;

  /**
   * AWS region (default: 'eu-south-1')
   */
  readonly region: string;
}
