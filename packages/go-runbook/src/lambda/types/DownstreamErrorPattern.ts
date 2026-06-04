/**
 * Maps a Lambda error message to a downstream microservice.
 *
 * The Lambda analog of `apigw.KnownUrl`: instead of matching an observed
 * URL, it matches a pattern in the error message (e.g.
 * `External service pn-emd-integration returned errors`).
 */
export interface DownstreamErrorPattern {
  /** Regular expression tested (case-insensitively) against the error message. */
  readonly pattern: string;
  /** Target microservice name (must match a {@link LambdaDownstream.name}). */
  readonly target: string;
  /** Optional human-readable description. */
  readonly description?: string;
}
