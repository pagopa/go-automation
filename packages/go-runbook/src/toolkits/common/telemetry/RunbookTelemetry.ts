import type { CloudWatchLogsTelemetry } from './CloudWatchLogsTelemetry.js';

export interface RunbookTelemetry {
  readonly cloudWatchLogs?: CloudWatchLogsTelemetry;
}
