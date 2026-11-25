import type { Runbook, RunbookExecutionResult } from '../../../engine/index.js';
import type { RunbookOutputContext } from './RunbookOutputContext.js';

export type RunbookOutputContextBuilderFn = (
  runbook: Runbook,
  result: RunbookExecutionResult,
) => RunbookOutputContext | undefined;
