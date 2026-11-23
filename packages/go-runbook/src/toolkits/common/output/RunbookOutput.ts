import type { RunbookExecutionStatus, RunbookType } from '../../../engine/index.js';
import type { AnalysisDraftV1 } from '../analysis/draft/AnalysisDraft.js';
import type { RunbookOutcome } from './RunbookOutcome.js';
import type { RunbookOutputContext } from './RunbookOutputContext.js';
import type { RunbookTelemetry } from '../telemetry/RunbookTelemetry.js';
import type { ErrorChainSummary } from './ErrorChainSummary.js';
import type { RunbookCoverageOutput } from './RunbookCoverageOutput.js';
import type { RUNBOOK_OUTPUT_SCHEMA_VERSION } from './RUNBOOK_OUTPUT_SCHEMA_VERSION.js';

export interface RunbookOutput {
  readonly schemaVersion: typeof RUNBOOK_OUTPUT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly runbook: {
    readonly id: string;
    readonly name: string;
    readonly type: RunbookType;
    readonly version: string;
    readonly team: string;
  };
  readonly execution: {
    readonly executionId: string;
    readonly startedAt: string;
    readonly completedAt: string;
    readonly durationMs: number;
    readonly status: RunbookExecutionStatus;
    readonly stepsExecuted: number;
    readonly traceFile?: string;
    readonly recoveredErrors: ReadonlyArray<{
      readonly stepId: string;
      readonly error: string;
    }>;
  };
  readonly input: Readonly<Record<string, string>>;
  readonly outcome: RunbookOutcome;
  /** The error chains, in time order; common to every outcome, empty when there is nothing to report. */
  readonly chains: ReadonlyArray<ErrorChainSummary>;
  readonly coverage: RunbookCoverageOutput;
  /** Deterministic analysis draft; absent when the outcome carries no analysis. */
  readonly analysis?: AnalysisDraftV1;
  readonly telemetry?: RunbookTelemetry;
  readonly context: RunbookOutputContext;
}
