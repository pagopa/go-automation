import type { RunbookContext } from './RunbookContext.js';
import type { ReadIdentifier } from './ReadIdentifier.js';

/** What the enumerator of a level receives. */
export interface TreeEnumeration {
  /** The window context (root level) or the context of the parent node. */
  readonly context: RunbookContext;
  /** Rows the read attributed to the parent; empty for the root level, which reads its own rows from the context. */
  readonly rows: ReadonlyArray<unknown>;
  /** Identifier the parent descended with; absent for the root level. */
  readonly identifier?: ReadIdentifier;
  /** Identifier of the second attempt at the same level, when the first found a better one. */
  readonly secondAttempt?: ReadIdentifier;
}
