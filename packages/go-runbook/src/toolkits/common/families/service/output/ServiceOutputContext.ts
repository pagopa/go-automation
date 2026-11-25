import type { LogLine } from '../../../parsing/aws/cloudwatch-logs/LogLine.js';
import type { AlarmOutput } from '../../../output/AlarmOutput.js';

export interface ServiceOutputContext {
  readonly alarm: AlarmOutput;
  readonly service: {
    readonly name: string;
    readonly logGroup: string;
    readonly errorCount?: number;
    readonly traceId?: string;
    readonly fallbackUuid?: string;
    readonly errorMessage?: string;
    readonly traceLogCount?: number;
    readonly recentLogs: ReadonlyArray<LogLine>;
    readonly traceLogs: ReadonlyArray<LogLine>;
  };
}
