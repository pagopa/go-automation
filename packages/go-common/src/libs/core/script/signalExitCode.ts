import { constants } from 'node:os';

/** Fallback when the platform does not know the signal (POSIX SIGINT). */
const DEFAULT_SIGNAL_NUMBER = 2;

/**
 * Exit code of a process terminated by a signal, by shell convention:
 * `128 + signal number` (SIGINT → 130, SIGQUIT → 131, SIGTERM → 143).
 *
 * Lets callers (shells, CI, schedulers) tell an interrupted run from a
 * successful one after the graceful shutdown of `GOScript`.
 *
 * @param signal - Signal that started the shutdown
 * @returns The exit code
 */
export function signalExitCode(signal: NodeJS.Signals): number {
  return 128 + (constants.signals[signal] ?? DEFAULT_SIGNAL_NUMBER);
}
