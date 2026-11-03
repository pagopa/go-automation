import type { MappingTransforms } from '../MappingTransforms.js';

/**
 * Transforms shared by the built-in profiles: domestic addresses have no
 * foreign state, a digital address implies `PEC`, and the API product names
 * map to the canonical `AR` / `890`.
 */
export const COMMON_TRANSFORMS: MappingTransforms = {
  'physicalAddress.foreignState': [{ op: 'emptyIfIn', values: ['ITALIA', 'IT'] }],
  'digitalDomicile.type': [{ op: 'constantIfPresent', field: 'digitalDomicile.address', value: 'PEC' }],
  product: [{ op: 'map', values: { AR_REGISTERED_LETTER: 'AR', REGISTERED_LETTER_890: '890' } }],
};
