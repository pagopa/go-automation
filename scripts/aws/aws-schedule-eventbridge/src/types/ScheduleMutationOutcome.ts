/**
 * How the write to one account ended.
 *
 * `skipped` is the outcome of a profile the plan never meant to touch, and
 * `unchanged` of one that someone else had already moved between the preview
 * and the write — the two are reported separately on purpose.
 */
export type ScheduleMutationOutcome = 'changed' | 'unchanged' | 'skipped' | 'failed';
