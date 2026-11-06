import type { MappingConstantIfPresentTransform } from './MappingConstantIfPresentTransform.js';
import type { MappingDefaultTransform } from './MappingDefaultTransform.js';

/**
 * Transforms that only fill an empty field. They run after the merge of row,
 * CLI and environment values, so they rank just above the neutral defaults
 * (§7.4.2).
 */
export type MappingFillTransform = MappingConstantIfPresentTransform | MappingDefaultTransform;
