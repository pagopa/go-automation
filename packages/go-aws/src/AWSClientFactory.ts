import type { AWSClientBaseConfig } from './AWSClientBaseConfig.js';
import type { AWSDestroyableClient } from './AWSDestroyableClient.js';

/**
 * Creates one kind of AWS SDK client.
 *
 * Each service subpath exports its own factory (for example `S3_CLIENT` from
 * `@pagopa/go-aws/s3`), so a consumer loads only the SDK packages of the
 * services it actually uses.
 */
export interface AWSClientFactory<TClient extends AWSDestroyableClient> {
  /** Cache key; unique per client kind (e.g. `'s3'`). */
  readonly key: string;

  /**
   * Creates a client for the given region and credentials.
   *
   * @param config - Region and optional credential provider of the profile
   * @returns A new client instance
   */
  create(config: AWSClientBaseConfig): TClient;
}
