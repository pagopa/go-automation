/**
 * Classes of a failed `POST requests` (§8.1.4).
 *
 * - `global`: stops the run (401/403, invalid group, quota, SEND disabled);
 * - `row`: permanent error of the row (400, duplicate notice code);
 * - `duplicate`: 409 on the same protocol + token, the notification exists;
 * - `throttled`: 429, certainly not processed;
 * - `ambiguous`: timeout, 5xx, transport error: the notification may exist.
 */
export type SendFailureKind = 'global' | 'row' | 'duplicate' | 'throttled' | 'ambiguous';
