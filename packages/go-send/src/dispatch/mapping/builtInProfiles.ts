import type { MappingProfile } from './MappingProfile.js';
import { DIRECT_PROFILE } from './profiles/directProfile.js';
import { QA_TEST_PROFILE } from './profiles/qaTestProfile.js';
import { STANDARD_PROFILE } from './profiles/standardProfile.js';

/**
 * Mapping profiles shipped with the module, by name (`--mapping-profile`).
 */
export const BUILT_IN_PROFILES: ReadonlyMap<string, MappingProfile> = new Map<string, MappingProfile>([
  [STANDARD_PROFILE.name, STANDARD_PROFILE],
  [QA_TEST_PROFILE.name, QA_TEST_PROFILE],
  [DIRECT_PROFILE.name, DIRECT_PROFILE],
]);
