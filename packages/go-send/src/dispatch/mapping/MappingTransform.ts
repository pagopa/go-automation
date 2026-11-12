import type { MappingFillTransform } from './MappingFillTransform.js';
import type { MappingNormalizeTransform } from './MappingNormalizeTransform.js';

/**
 * One transform step of a mapping profile, discriminated by `op` (§7.3).
 * Within the steps of a field, normalizing transforms come before fill
 * transforms (checked by `parseMappingProfile`).
 */
export type MappingTransform = MappingNormalizeTransform | MappingFillTransform;
