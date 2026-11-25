/**
 * Search mode supported by GOFtsIndex.
 *
 * - `full-text`: FTS5 MATCH with BM25 ranking and snippet support.
 * - `literal`:   case-insensitive substring scan, useful for IDs / UUIDs / strings
 *   with punctuation that the tokenizer would split.
 */
export const GOFtsIndexSearchMode = {
  FULL_TEXT: 'full-text',
  LITERAL: 'literal',
} as const;

export type GOFtsIndexSearchModeValue = (typeof GOFtsIndexSearchMode)[keyof typeof GOFtsIndexSearchMode];
