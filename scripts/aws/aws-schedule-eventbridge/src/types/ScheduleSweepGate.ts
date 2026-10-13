/**
 * Verdict of the confirmation gate.
 *
 * Three states, not a boolean: the two ways of not writing are not
 * interchangeable downstream. A `cancelled` run exits zero even when a profile
 * failed to read, because the operator stopped deliberately and the error was
 * already printed, whereas `nothing-to-do` still reports the fleet verdict.
 *
 * A fourth `dry-run` state belongs here once go-common exposes `isDryRun`: the
 * gate is where `--dry-run` has to be answered, before the prompt.
 */
export type ScheduleSweepGate = 'proceed' | 'nothing-to-do' | 'cancelled';
