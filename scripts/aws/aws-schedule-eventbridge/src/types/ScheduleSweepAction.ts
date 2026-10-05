/**
 * What the sweep intends to do to one account.
 *
 * `no-op` means the account already sits in the requested state, so it is
 * reported as converged without an `UpdateSchedule` call.
 */
export type ScheduleSweepAction = 'update' | 'no-op' | 'missing' | 'error';
