import type { CANONICAL_FIELDS } from './canonicalFields.js';

/**
 * Name of a canonical field (e.g. `recipient.taxId`).
 */
export type CanonicalField = (typeof CANONICAL_FIELDS)[number];
