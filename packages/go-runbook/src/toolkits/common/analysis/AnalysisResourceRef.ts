/**
 * Human-readable reference to a resource of the Watchtower product census.
 *
 * Runbooks never carry Watchtower ids: the reverse lookup happens inside the
 * apply transaction, and a declared name that does not resolve blocks the apply.
 */
export interface AnalysisResourceRef {
  /** Exact resource name in the Watchtower census of the product (≤255). */
  readonly name: string;
  /** Watchtower type (e.g. 'Service', 'Lambda'); when present it is VERIFIED. */
  readonly type?: string;
  /** Provenance; v1 emits 'PRIMARY'/'CASE_RELATED', 'QUERIED' is reserved for the runtime extension. */
  readonly role?: 'PRIMARY' | 'QUERIED' | 'CASE_RELATED';
}
