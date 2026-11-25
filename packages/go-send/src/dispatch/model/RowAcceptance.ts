/**
 * What the run knows about SEND's acceptance of a row's notification, from
 * the evidence in the ledger (see `acceptanceOf`):
 * - `ACCEPTED`: verified accepted, or the timeline shows a step that only
 *   follows acceptance;
 * - `REFUSED`: refused by the verification or by a `REQUEST_REFUSED` timeline;
 * - `UNKNOWN`: no evidence either way (not sent, not verified, timed out).
 */
export type RowAcceptance = 'ACCEPTED' | 'REFUSED' | 'UNKNOWN';
