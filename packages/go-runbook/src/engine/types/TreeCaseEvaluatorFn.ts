import type { KnownError } from './KnownError.js';
import type { KnownErrorDetection } from './KnownErrorDetection.js';
import type { RunbookContext } from './RunbookContext.js';

/** Evaluates known errors on the context of an error node. */
export type TreeCaseEvaluatorFn = (
  knownErrors: ReadonlyArray<KnownError>,
  context: RunbookContext,
  nodeId: string,
) => ReadonlyArray<KnownErrorDetection>;
