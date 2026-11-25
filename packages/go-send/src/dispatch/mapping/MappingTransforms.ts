import type { CanonicalField } from './CanonicalField.js';
import type { MappingTransform } from './MappingTransform.js';

/**
 * Transforms of a mapping profile, by canonical field.
 */
export type MappingTransforms = Readonly<Partial<Record<CanonicalField, ReadonlyArray<MappingTransform>>>>;
