import type { ErrorNodeSpec } from './ErrorNodeSpec.js';
import type { ObservedErrors } from './ObservedErrors.js';

/** What the enumerator of a level returns: the error nodes and the related rows that are not errors. */
export interface TreeEnumerated {
  readonly nodes: ReadonlyArray<ErrorNodeSpec>;
  /**
   * The related rows that are not errors, as pseudo-nodes, one per route they show: the steps of the level run on
   * each to find the route (an INFO line towards Checkout). Their descents go to the parent, through this level, when
   * no error branch already covers the same target and identifier; they never become nodes.
   */
  readonly routings?: ReadonlyArray<ErrorNodeSpec>;
  /** Root level only: the errors of the window, all examined as nodes. */
  readonly observedErrors?: Omit<ObservedErrors, 'examined'>;
}
