/**
 * Single search hit returned by GOFtsIndex.search.
 */
export interface GOFtsIndexSearchResult {
  /** Document id. */
  readonly id: string;
  /** BM25 score (lower is better) for full-text; 0 for literal mode. */
  readonly score: number;
  /** Highlighted excerpt around the match. */
  readonly snippet: string;
  /** Metadata associated with the document (joined from the side table). */
  readonly metadata: Readonly<Record<string, string | number | null>>;
}
