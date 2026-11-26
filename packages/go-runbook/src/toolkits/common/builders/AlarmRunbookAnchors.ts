import type { PipelineHook } from '../../../engine/index.js';

/**
 * Hook wiring, for the pipelines that declare anchors. The three travel
 * together: without hooks there is nothing to check and no name to report.
 */
export interface AlarmRunbookAnchors<TAnchor extends string> {
  /** Hooks the toolkit accepted from its config. */
  readonly hooks: ReadonlyArray<PipelineHook<TAnchor>>;
  /** Anchors the pipeline actually reached while wiring its steps. */
  readonly reached: ReadonlySet<TAnchor>;
  /** Pipeline name used in the orphan-anchor error (e.g. `Lambda`). */
  readonly pipelineName: string;
}
