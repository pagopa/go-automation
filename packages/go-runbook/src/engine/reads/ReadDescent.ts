import type { ReadScope } from './ReadScope.js';

/** A descent of an error node towards a level, as the read ledger knows it. */
export interface ReadDescent {
  readonly scope: ReadScope;
  readonly target: string;
}
