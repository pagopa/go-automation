import type { RunIdentityKey } from './RunIdentityKey.js';

/**
 * Identity settings of a run, each rendered as a string (empty when unset),
 * so that `run.json` stores them as plain JSON and a resume compares them
 * with `===`.
 */
export type RunIdentity = Readonly<Record<RunIdentityKey, string>>;
