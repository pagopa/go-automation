/**
 * Minimal shape of an AWS SDK v3 client: every client can release its resources.
 */
export interface AWSDestroyableClient {
  destroy(): void;
}
