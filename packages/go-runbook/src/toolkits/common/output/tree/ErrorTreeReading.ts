import type { ErrorChainGroup } from '../ErrorChainGroup.js';
import type { ErrorTreeView } from './ErrorTreeView.js';

/** What the output computes once from the error tree and shares with the analysis draft. */
export interface ErrorTreeReading {
  readonly view: ErrorTreeView;
  readonly chains: ReadonlyArray<ErrorChainGroup>;
  readonly coverageLines: ReadonlyArray<string>;
}
