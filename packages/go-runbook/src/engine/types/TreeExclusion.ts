import type { Condition } from './Condition.js';

/**
 * A diagnosis a case of the parent requires to be absent from the whole read of this level for that parent. The
 * result is published on the parent as `<varPrefix>Exclusion.<name>`: `present`, `absent` (complete read without it)
 * or `unknown` (incomplete, skipped or failed read).
 */
export interface TreeExclusion {
  readonly name: string;
  /** Evaluated on a context where the read step of the level returns every row read for the parent. */
  readonly condition: Condition;
}
