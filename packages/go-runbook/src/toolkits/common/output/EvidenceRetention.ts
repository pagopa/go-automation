/** How much of a successful step's collected evidence reaches the occurrence. */
export type EvidenceRetention =
  // Use for queries that already reject incomplete/capped results.
  { readonly mode: 'all' } | { readonly mode: 'latest'; readonly limit: number; readonly timestampField: string };
