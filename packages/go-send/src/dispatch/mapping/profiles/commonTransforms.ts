import type { MappingTransforms } from '../MappingTransforms.js';

/**
 * Transforms shared by the built-in profiles: domestic addresses have no
 * foreign state, and a digital address implies `PEC`. Product names
 * (`AR_REGISTERED_LETTER`, `REGISTERED_LETTER_890`) are translated by
 * `buildRecord`, the single place that knows the `e2e` products.
 */
export const COMMON_TRANSFORMS: MappingTransforms = {
  'physicalAddress.foreignState': [{ op: 'emptyIfIn', values: ['ITALIA', 'IT'] }],
  'digitalDomicile.type': [{ op: 'constantIfPresent', field: 'digitalDomicile.address', value: 'PEC' }],
};
