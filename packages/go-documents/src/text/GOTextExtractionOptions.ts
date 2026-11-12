/**
 * Per-call options for text extraction.
 */
export interface GOTextExtractionOptions {
  /**
   * Maximum bytes of UTF-8 text to return. Defaults to 5 * 1024 * 1024.
   * Output is truncated at the closest character boundary that does not
   * exceed this limit; `truncated` is set to true in the result.
   */
  readonly maxBytes?: number;

  /**
   * Optional abort signal. Honoured by extractors where the underlying library
   * supports it.
   */
  readonly signal?: AbortSignal;
}
