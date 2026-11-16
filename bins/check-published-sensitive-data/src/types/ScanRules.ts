/** Compiled rules: build them once per run with `compileScanRules`. */
export interface ScanRules {
  readonly allowedAccountIds: ReadonlySet<string>;
  /** Whole-token match of the known profile names, when there are any. */
  readonly profileNames?: RegExp;
  /** Whole-token match of the SSO profile prefixes, when there are any. */
  readonly profilePrefixes?: RegExp;
  /** `file\u0000value` of every exception of the scanned package. */
  readonly exceptions: ReadonlySet<string>;
}
