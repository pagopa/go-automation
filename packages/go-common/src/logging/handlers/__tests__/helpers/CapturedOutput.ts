/**
 * Text written to stdout and through `console.error` while a function ran.
 */
export interface CapturedOutput {
  readonly stdout: string;
  readonly stderr: string;
}
