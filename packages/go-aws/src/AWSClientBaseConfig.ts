import type { fromIni } from '@aws-sdk/credential-provider-ini';

/**
 * Configuration passed to every AWS SDK client created for one profile:
 * the region and, when a named profile is used, its credential provider.
 */
export interface AWSClientBaseConfig {
  readonly region: string;
  readonly credentials?: ReturnType<typeof fromIni>;
}
