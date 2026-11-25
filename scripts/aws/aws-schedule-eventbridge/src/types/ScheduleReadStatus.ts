/**
 * Outcome of reading one account's copy of the target schedule.
 *
 * `not-found` is kept distinct from `error` because a schedule missing from an
 * account is configuration drift, not a failure: the sweep reports it and keeps
 * going unless `--fail-on-missing` is set.
 */
export type ScheduleReadStatus = 'found' | 'not-found' | 'error';
