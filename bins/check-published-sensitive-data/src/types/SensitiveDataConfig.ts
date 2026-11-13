import type { AllowedValue } from './AllowedValue.js';
import type { SensitiveDataException } from './SensitiveDataException.js';

/** Rules of `published-sensitive-data.config.json` (EVO-AWSACCT-OPUS-01 §9). */
export interface SensitiveDataConfig {
  /** Synthetic account ids accepted everywhere (also as the account of an ARN). */
  readonly allowedAccountIds: ReadonlyArray<AllowedValue>;
  /** Exact names of real AWS profiles: this file stays in the private repository. */
  readonly profileNames: ReadonlyArray<string>;
  /** Prefixes of SSO credential profile names (e.g. `sso_`). */
  readonly profilePrefixes: ReadonlyArray<string>;
  /** Path segments that must never be published (e.g. `__tests__`). */
  readonly forbiddenPathSegments: ReadonlyArray<string>;
  /** File suffixes that must never be published (e.g. `.tsbuildinfo`). */
  readonly forbiddenSuffixes: ReadonlyArray<string>;
  /** Per-file, per-value exceptions. */
  readonly exceptions: ReadonlyArray<SensitiveDataException>;
}
