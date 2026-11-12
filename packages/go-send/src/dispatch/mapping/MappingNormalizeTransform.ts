import type { MappingEmptyIfInTransform } from './MappingEmptyIfInTransform.js';
import type { MappingMapTransform } from './MappingMapTransform.js';
import type { MappingTrimTransform } from './MappingTrimTransform.js';
import type { MappingUpperTransform } from './MappingUpperTransform.js';

/**
 * Transforms that normalize the value read from the input row. They run on
 * the row layer only, before the merge with CLI and environment values.
 */
export type MappingNormalizeTransform =
  MappingTrimTransform | MappingUpperTransform | MappingEmptyIfInTransform | MappingMapTransform;
