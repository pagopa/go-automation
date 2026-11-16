/**
 * Bounds of the Watchtower analysis draft contract (§5.1).
 *
 * They live in one place because two independent guards enforce them:
 * `assertAnalysisAnnotations` at registration time, and `toCompleteAnalysisDraft`
 * on the worker before the completion callback. Two copies of the same numbers
 * would drift apart, and a draft that passes one guard but not the other is the
 * exact failure the double check exists to prevent.
 */
export const ANALYSIS_DRAFT_BOUNDS = {
  /** Watchtower registry names (resources, downstreams, final actions, runbook). */
  NAME_LENGTH: 255,
  /** `conclusionNotes` and `errorDetails`. */
  TEXT_LENGTH: 5_000,
  URL_LENGTH: 2_000,
  LINK_TYPE_LENGTH: 50,
  IGNORE_REASON_CODE_LENGTH: 100,
  /** Maximum items per reference array. */
  ARRAY_ITEMS: 64,
  /** Raw budget of the serialized draft enforced by Watchtower (§5.4). */
  DRAFT_BYTES: 65_536,
} as const;
