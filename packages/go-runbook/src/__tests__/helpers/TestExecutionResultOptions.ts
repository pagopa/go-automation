import type { KnownCase } from '../../engine/types/KnownCase.js';
import type { RunbookExecutionStatus } from '../../engine/types/RunbookExecutionStatus.js';
import type { TestContextOptions } from './TestContextOptions.js';

/** Content of a result built by {@link createTestExecutionResult}: its final context and outcome. */
export interface TestExecutionResultOptions extends TestContextOptions {
  readonly status?: RunbookExecutionStatus;
  /** The matched cases, in priority order. */
  readonly matchedCases?: ReadonlyArray<KnownCase>;
}
