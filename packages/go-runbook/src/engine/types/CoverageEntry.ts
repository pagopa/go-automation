import type { StepCoverage } from './StepCoverage.js';

/** A {@link StepCoverage} collected by the engine, with the step that declared it. */
export interface CoverageEntry extends StepCoverage {
  readonly stepId: string;
}
