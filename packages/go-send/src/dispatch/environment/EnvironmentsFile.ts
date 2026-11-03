import type { EnvironmentDefinition } from './EnvironmentDefinition.js';

/**
 * Parsed environments file, by environment name.
 */
export interface EnvironmentsFile {
  readonly source: string;
  readonly environments: ReadonlyMap<string, EnvironmentDefinition>;
}
