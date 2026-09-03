import type { LogLine } from '../../output/LogLine.js';

/** Downstream microservice block of the Lambda output context. */
export interface LambdaDownstreamOutput {
  readonly target: string;
  readonly logGroup?: string;
  readonly logCount?: number;
  readonly errorMessage?: string;
  readonly recentLogs: ReadonlyArray<LogLine>;
}

/** Typed `details.lambda` payload of a Lambda runbook result. */
export interface LambdaOutputContext {
  readonly alarm: {
    readonly name?: string;
    readonly datetime?: string;
    readonly datetimeEnd?: string;
    readonly timeRange: {
      readonly start?: string;
      readonly end?: string;
    };
  };
  readonly lambda: {
    readonly functionName: string;
    readonly logGroup: string;
    readonly eventSource?: string;
    readonly configuredTimeoutMs?: number;
    readonly errorCount?: number;
    readonly requestId?: string;
    readonly errorCategory?: string;
    readonly runtimeStatus?: string;
    readonly durationMs?: number;
    readonly billedDurationMs?: number;
    readonly memorySizeMb?: number;
    readonly maxMemoryUsedMb?: number;
    readonly errorMessage?: string;
    readonly invocationLogCount?: number;
    readonly recentLogs: ReadonlyArray<LogLine>;
  };
  readonly downstream?: LambdaDownstreamOutput;
}
