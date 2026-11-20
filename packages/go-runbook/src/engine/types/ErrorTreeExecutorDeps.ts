import type { TreeCaseEvaluatorFn } from './TreeCaseEvaluatorFn.js';
import type { TreeReadRecorderFn } from './TreeReadRecorderFn.js';
import type { TreeStepsRunnerFn } from './TreeStepsRunnerFn.js';
import type { TreeSkippedRecorderFn } from './TreeSkippedRecorderFn.js';

/** Collaborators of the error-tree executor, provided by the engine. */
export interface ErrorTreeExecutorDeps {
  readonly runSteps: TreeStepsRunnerFn;
  readonly recordRead: TreeReadRecorderFn;
  readonly evaluateCases: TreeCaseEvaluatorFn;
  readonly recordSkipped: TreeSkippedRecorderFn;
}
