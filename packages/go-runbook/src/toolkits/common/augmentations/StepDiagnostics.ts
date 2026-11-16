import type { CloudWatchLogsStepDiagnostics } from '../telemetry/CloudWatchLogsStepDiagnostics.js';

declare module '../../../engine/tracing/StepDiagnostics.js' {
  /** Operational diagnostics of a step. */
  interface StepDiagnostics {
    /** CloudWatch Logs Insights statistics of the queries the step ran. */
    readonly cloudWatchLogs?: CloudWatchLogsStepDiagnostics;
  }
}

/** Marker that loads the operational fields of `StepDiagnostics`. */
export type StepDiagnosticsAugmentation = 'stepDiagnostics';
