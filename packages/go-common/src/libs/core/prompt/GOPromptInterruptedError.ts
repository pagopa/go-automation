/**
 * The user pressed Ctrl+C while a `GOPrompt` prompt was waiting for an answer.
 *
 * While a prompt is open the terminal is in raw mode, so Ctrl+C reaches the
 * process as a key, not as `SIGINT`. `GOPrompt` turns it into this error
 * instead of exiting, so the caller's `finally` blocks run and `GOScript.run()`
 * can do its normal cleanup (including the `onCleanup` hook) before exiting
 * with `130`, as it does for `SIGINT`. Code using `GOPrompt` outside
 * `GOScript.run()` should treat it as an interruption and exit with `130`.
 */
export class GOPromptInterruptedError extends Error {
  constructor() {
    super('Prompt interrupted by the user (Ctrl+C)');
    this.name = 'GOPromptInterruptedError';
  }
}
