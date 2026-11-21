import type { ReadLedger } from '../reads/ReadLedger.js';
import type { TreeCaseEvaluatorFn } from './TreeCaseEvaluatorFn.js';
import type { TreeReadRecorderFn } from './TreeReadRecorderFn.js';
import type { TreeStepsRunnerFn } from './TreeStepsRunnerFn.js';

/** Collaborators of the error-tree executor, provided by the engine. */
export interface ErrorTreeExecutorDeps {
  readonly runSteps: TreeStepsRunnerFn;
  readonly recordRead: TreeReadRecorderFn;
  readonly evaluateCases: TreeCaseEvaluatorFn;
  readonly ledger: ReadLedger;
}
