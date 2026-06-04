/** A single log line surfaced in the Lambda output context. */
export interface LambdaLogLine {
  readonly timestamp: string;
  readonly message: string;
}

/** Downstream microservice block of the Lambda output context. */
export interface LambdaDownstreamOutput {
  readonly target: string;
  readonly logGroup?: string;
  readonly logCount?: number;
  readonly errorMessage?: string;
  readonly recentLogs: ReadonlyArray<LambdaLogLine>;
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
    readonly recentLogs: ReadonlyArray<LambdaLogLine>;
  };
  readonly downstream?: LambdaDownstreamOutput;
}
