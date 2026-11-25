import type { RelativePathPredicate } from './RelativePathPredicate.js';
import type { ScanRules } from './ScanRules.js';

/** What `scanTree` checks besides the content. */
export interface ScanTreeOptions {
  readonly rules: ScanRules;
  /** Path segments that make an entry forbidden (G-pub-1); empty for the sources check. */
  readonly forbiddenPathSegments: ReadonlyArray<string>;
  /** File suffixes that make an entry forbidden (G-pub-1); empty for the sources check. */
  readonly forbiddenSuffixes: ReadonlyArray<string>;
  /** Relative paths to skip entirely (the sources check skips tests); none by default. */
  readonly skip?: RelativePathPredicate;
}
