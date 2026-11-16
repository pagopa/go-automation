/**
 * Final status of a runbook execution.
 *
 * - `completed`: the runbook reached a normal terminal point, including
 *   an explicit step `next: 'stop'` directive.
 * - `failed`: an unrecovered execution error interrupted the run.
 * - `aborted`: the caller cancelled execution through an AbortSignal.
 */
export type RunbookExecutionStatus = 'completed' | 'failed' | 'aborted';
