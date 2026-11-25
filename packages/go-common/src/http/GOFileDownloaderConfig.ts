/**
 * Configuration for GOFileDownloader.
 */
export interface GOFileDownloaderConfig {
  /** Default headers applied to every request (e.g. Authorization). */
  readonly defaultHeaders?: Readonly<Record<string, string>>;

  /** Per-request timeout in milliseconds. Defaults to 60_000. */
  readonly timeoutMs?: number;

  /** Optional HTTP proxy (e.g. http://127.0.0.1:9090). */
  readonly proxyUrl?: string;

  /** Maximum retry attempts for retriable errors (429/5xx/network). Defaults to 3. */
  readonly maxRetries?: number;

  /** Base backoff in ms; doubled at each retry. Defaults to 1000. */
  readonly backoffBaseMs?: number;

  /** Random jitter in ms added to each backoff. Defaults to 200. */
  readonly backoffJitterMs?: number;

  /**
   * Header names whose values must NEVER appear in event payloads or logs.
   * Compared case-insensitively. Defaults to ['authorization', 'cookie'].
   */
  readonly redactHeaders?: ReadonlyArray<string>;
}
