import type { ReadScope } from '../reads/ReadScope.js';
import type { RunbookContext } from './RunbookContext.js';
import type { StepDescriptor } from './StepDescriptor.js';
import type { TreeStepsRun } from './TreeStepsRun.js';

/** Runs a list of steps in the context of an error node, recording their gaps in its scope. */
export type TreeStepsRunnerFn = (
  steps: ReadonlyArray<StepDescriptor>,
  context: RunbookContext,
  scope: ReadScope,
) => Promise<TreeStepsRun>;
