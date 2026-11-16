/**
 * POSIX numbers of the signals handled by `GOScript`. Fixed rather than read
 * from `os.constants.signals`, which lacks some of them on Windows (no
 * `SIGQUIT`), so the exit code is the same on every platform.
 */
const SIGNAL_NUMBERS: ReadonlyMap<NodeJS.Signals, number> = new Map<NodeJS.Signals, number>([
  ['SIGINT', 2],
  ['SIGQUIT', 3],
  ['SIGTERM', 15],
]);

/** Exit code for a signal with no known number: a generic failure. */
const UNKNOWN_SIGNAL_EXIT_CODE = 1;

/**
 * Exit code of a process terminated by a signal, by shell convention:
 * `128 + signal number` (SIGINT → 130, SIGQUIT → 131, SIGTERM → 143).
 *
 * Lets callers (shells, CI, schedulers) tell an interrupted run from a
 * successful one after the graceful shutdown of `GOScript`. Only the three
 * signals `GOScript` handles are mapped, with their POSIX numbers on every
 * platform; any other signal yields `1`.
 *
 * @param signal - Signal that started the shutdown
 * @returns The exit code
 */
export function signalExitCode(signal: NodeJS.Signals): number {
  const signalNumber = SIGNAL_NUMBERS.get(signal);
  return signalNumber === undefined ? UNKNOWN_SIGNAL_EXIT_CODE : 128 + signalNumber;
}
