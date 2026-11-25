/**
 * A phase of `--phases`: send through the B2B API (or pn-external-channels in
 * `direct`), acceptance check, `requestId` lookup on `pn-Timelines`.
 */
export type DispatchPhaseName = 'send' | 'verify' | 'request-id';
