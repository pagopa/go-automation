/**
 * Represents the author of a received message
 */
export interface GOMessageAuthor {
  /** Provider-specific user ID */
  readonly id: string;
  /** Display name of the author */
  readonly name?: string;
  /** Whether the author is a bot */
  readonly isBot?: boolean;
}
