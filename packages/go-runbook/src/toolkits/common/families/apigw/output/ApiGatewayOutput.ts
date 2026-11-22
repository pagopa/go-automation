import type { LogLine } from '../../../parsing/aws/cloudwatch-logs/LogLine.js';

export interface ApiGatewayOutput {
  readonly logGroup: string;
  readonly errorCount?: number;
  readonly statusCode?: string;
  readonly httpMethod?: string;
  readonly path?: string;
  readonly sourceIp?: string;
  readonly traceId?: string;
  readonly traceIdField?: string;
  readonly fallbackUuid?: string;
  readonly errorMessage?: string;
  readonly recentLogs: ReadonlyArray<LogLine>;
}
