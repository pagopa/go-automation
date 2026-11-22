import type { COVERAGE_REASONS } from './COVERAGE_REASONS.js';

/**
 * Why a source of evidence is incomplete: `saturated` (the read hit its limit), `unavailable` (the read failed),
 * `skipped` (no usable identifier) or `manual` (the correlation needs a person).
 */
export type CoverageReason = (typeof COVERAGE_REASONS)[number];
