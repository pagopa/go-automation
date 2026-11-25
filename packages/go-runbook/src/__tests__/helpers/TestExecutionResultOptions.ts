import type { KnownCase } from '../../engine/types/KnownCase.js';
import type { CoverageEntry } from '../../engine/types/CoverageEntry.js';
import type { RunbookExecutionStatus } from '../../engine/types/RunbookExecutionStatus.js';
import type { TestContextOptions } from './TestContextOptions.js';

/** Content of a result built by {@link createTestExecutionResult}: its final context and outcome. */
export interface TestExecutionResultOptions extends TestContextOptions {
  readonly status?: RunbookExecutionStatus;
  /** The matched cases, in the order of the detections. */
  readonly matchedCases?: ReadonlyArray<KnownCase>;
  /** Incomplete sources of the evidence. */
  readonly coverage?: ReadonlyArray<CoverageEntry>;
}
