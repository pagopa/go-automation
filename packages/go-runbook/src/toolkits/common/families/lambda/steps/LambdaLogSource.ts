import type { OperationalContext } from '../../../services/OperationalContext.js';

/** One source of the step: the tag written on its rows, how it is named in messages, its reader. */
export interface LambdaLogSource {
  readonly key: string;
  readonly display: string;
  readonly context: OperationalContext;
}
