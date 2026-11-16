/**
 * A single log line surfaced in a runbook output context.
 *
 * Shared by every analyzer family: the API Gateway, Lambda and service
 * output contexts all expose the same `{ timestamp, message }` shape and
 * alias this type under their own name.
 */
export interface LogLine {
  readonly timestamp: string;
  readonly message: string;
}
