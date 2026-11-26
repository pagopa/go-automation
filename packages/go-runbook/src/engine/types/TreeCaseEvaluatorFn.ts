import type { KnownCase } from './KnownCase.js';
import type { KnownCaseDetection } from './KnownCaseDetection.js';
import type { RunbookContext } from './RunbookContext.js';

/** Evaluates known cases on the context of an error node. */
export type TreeCaseEvaluatorFn = (
  knownCases: ReadonlyArray<KnownCase>,
  context: RunbookContext,
  nodeId: string,
) => ReadonlyArray<KnownCaseDetection>;
