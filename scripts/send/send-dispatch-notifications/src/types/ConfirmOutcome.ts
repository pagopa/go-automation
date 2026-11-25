/**
 * Result of the confirmation before the run (§14.2):
 * - `CONFIRMED`: proceed;
 * - `DECLINED`: the user answered no (or left the prompt), nothing is sent;
 * - `NOT_CONFIRMED`: production without the right `--confirm-production`.
 */
export type ConfirmOutcome = 'CONFIRMED' | 'DECLINED' | 'NOT_CONFIRMED';
