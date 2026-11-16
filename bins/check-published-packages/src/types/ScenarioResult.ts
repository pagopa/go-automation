import type { PackageManager } from './PackageManager.js';

/** Outcome of one scenario with one package manager. */
export interface ScenarioResult {
  readonly scenario: string;
  readonly manager: PackageManager;
  readonly failures: ReadonlyArray<string>;
  /** Extra facts for the summary (bundle size, RSS, …). */
  readonly notes: ReadonlyArray<string>;
}
