import type { RunbookExecutionStatus } from '../types/RunbookExecutionStatus.js';
import type { RunbookType } from '../types/RunbookType.js';
import type { RunbookOutcome } from './RunbookOutcome.js';
import type { RunbookOutputContext } from './RunbookOutputContext.js';
import type { RunbookTelemetry } from './RunbookTelemetry.js';

export interface RunbookOutput {
  readonly schemaVersion: '1.0.0';
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
    readonly earlyResolution: boolean;
    readonly resolvedAtStep?: string;
    readonly traceFile?: string;
    readonly recoveredErrors: ReadonlyArray<{
      readonly stepId: string;
      readonly error: string;
    }>;
  };
  readonly input: Readonly<Record<string, string>>;
  readonly outcome: RunbookOutcome;
  readonly telemetry?: RunbookTelemetry;
  readonly context: RunbookOutputContext;
}
