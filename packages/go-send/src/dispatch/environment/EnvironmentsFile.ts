import type { DirectEnvironmentDefinition } from './DirectEnvironmentDefinition.js';
import type { EnvironmentDefinition } from './EnvironmentDefinition.js';

/**
 * Parsed environments file, by environment name. Names are unique across
 * the two maps (they share one YAML mapping).
 */
export interface EnvironmentsFile {
  readonly source: string;
  /** `e2e` environments (SEND B2B API). */
  readonly environments: ReadonlyMap<string, EnvironmentDefinition>;
  /** `mode: direct` environments (pn-external-channels). */
  readonly directEnvironments: ReadonlyMap<string, DirectEnvironmentDefinition>;
}
