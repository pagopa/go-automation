import { signalExitCode } from '@pagopa/go-common/process';

/**
 * A `GOPrompt` prompt was closed by an interruption while waiting for an answer:
 * Ctrl+C, or a `SIGINT`/`SIGTERM`/`SIGQUIT` delivered to the process.
 *
 * While a prompt is open the terminal is in raw mode, so Ctrl+C reaches the
 * process as a key, not as `SIGINT`; a signal sent by another process (e.g.
 * `docker stop`) would leave the prompt waiting forever. `GOPrompt` turns both
 * into this error instead of exiting, so the caller's `finally` blocks run and
 * `GOScript.run()` can do its normal cleanup (including the `onCleanup` hook)
 * before exiting with {@link exitCode}, the same code as its signal handler.
 * Code using `GOPrompt` outside `GOScript.run()` should treat it as an
 * interruption and exit with {@link exitCode}.
 */
export class GOPromptInterruptedError extends Error {
  /**
   * @param signal - Signal that interrupted the prompt (`SIGINT` for Ctrl+C)
   */
  constructor(public readonly signal: NodeJS.Signals = 'SIGINT') {
    super(signal === 'SIGINT' ? 'Prompt interrupted by the user (Ctrl+C)' : `Prompt interrupted by ${signal}`);
    this.name = 'GOPromptInterruptedError';
  }

  /** Exit code by shell convention: `128 + signal number` (130 for Ctrl+C, 143 for SIGTERM). */
  public get exitCode(): number {
    return signalExitCode(this.signal);
  }
}
