/**
 * Why a source of evidence is incomplete: `saturated` (the read hit its limit), `unavailable` (the read failed),
 * `skipped` (no usable identifier) or `manual` (the correlation needs a person).
 */
export type CoverageReason = 'saturated' | 'unavailable' | 'skipped' | 'manual';
