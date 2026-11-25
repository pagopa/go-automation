import type { SensitiveFinding } from './SensitiveFinding.js';

/** A finding with the package and check that produced it. */
export interface ScopedFinding {
  /** `<package> (archive)` or `<package> (sources)`. */
  readonly scope: string;
  readonly finding: SensitiveFinding;
}
