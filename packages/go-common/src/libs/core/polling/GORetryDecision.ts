/**
 * Outcome of a {@link GORetryClassifier} for a given error.
 *
 * - `'retriable'` — the runner should retry the operation.
 * - `'fatal'` — the runner must propagate the error immediately.
 * - `'unknown'` — the classifier doesn't recognise this error; the runner
 *   falls back to its `unknownDecision` policy (default `'fatal'` for safety).
 */
export type GORetryDecision = 'retriable' | 'fatal' | 'unknown';
