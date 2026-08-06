/**
 * Downstream catalog of the INTEROP product.
 *
 * Values replicate the Watchtower census byte for byte, exactly as for SEND. The
 * catalogs are per product precisely because the censuses differ.
 */
export const INTEROP_DOWNSTREAMS = {
  NESSUNO: 'Nessuno',
  ONE_TRUST: 'One-Trust',
  // Spelling "Selfcare" of the INTEROP census — different from SEND's "SelfCare".
  SELFCARE: 'Selfcare',
} as const;

export type InteropDownstream = (typeof INTEROP_DOWNSTREAMS)[keyof typeof INTEROP_DOWNSTREAMS];
