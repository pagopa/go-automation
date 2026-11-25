/**
 * A document indexed by GOFtsIndex.
 */
export interface GOFtsIndexDocument {
  /** Stable unique identifier (caller-defined). */
  readonly id: string;
  /** Full-text content to index. */
  readonly content: string;
  /** Metadata key/value pairs. Keys must be declared in GOFtsIndexConfig.metadataColumns. */
  readonly metadata?: Readonly<Record<string, string | number | null>>;
}
