/**
 * AWS credential source types
 *
 * Identifies how AWS credentials should be obtained
 * based on the execution environment.
 */
export enum GOCredentialSource {
  /** SSO profile login (local interactive) */
  SSO_PROFILE = 'sso_profile',

  /** Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) */
  ENVIRONMENT = 'environment',

  /** ECS container credentials (task role) */
  CONTAINER = 'container',

  /** EC2 instance metadata service (instance profile) */
  INSTANCE_METADATA = 'instance_metadata',

  /** Web identity token file (OIDC federation, EKS) */
  WEB_IDENTITY = 'web_identity',

  /** AWS SDK default credential chain (auto-detect) */
  DEFAULT_CHAIN = 'default_chain',

  /** No credentials available */
  NONE = 'none',
}
