import type { SensitiveDataRule } from './SensitiveDataRule.js';

/** A sensitive value, or a forbidden entry, found in a published file. */
export interface SensitiveFinding {
  /** Path relative to the scanned root. */
  readonly file: string;
  /** 1-based line; 0 for a forbidden entry. */
  readonly line: number;
  readonly rule: SensitiveDataRule;
  /** The matched value; masked by `formatFinding` before it is printed. */
  readonly value: string;
}
