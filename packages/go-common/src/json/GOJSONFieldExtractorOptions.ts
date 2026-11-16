/**
 * Options for GOJSONFieldExtractor
 */
export interface GOJSONFieldExtractorOptions {
  /** Maximum recursion depth for key search (default: 50) */
  readonly maxDepth?: number;

  /** Enable parsing of embedded JSON strings, e.g. SQS Body (default: false) */
  readonly parseEmbeddedJson?: boolean;

  /** Minimum string length to attempt embedded JSON parsing (default: 2) */
  readonly minEmbeddedJsonLength?: number;
}
