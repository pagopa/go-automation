import type { LogLine } from '../../../parsing/aws/cloudwatch-logs/LogLine.js';
import type { AlarmOutput } from '../../../output/AlarmOutput.js';
import type { LambdaDownstreamOutput } from './LambdaDownstreamOutput.js';

/** Typed `details.lambda` payload of a Lambda runbook result. */
export interface LambdaOutputContext {
  readonly alarm: AlarmOutput;
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
