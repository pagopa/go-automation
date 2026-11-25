import type { ErrorChainGroup } from './ErrorChainGroup.js';

/** A chain group as the output reports it: every count, route, sample and time, without the list of its members. */
export type ErrorChainSummary = Omit<ErrorChainGroup, 'members'>;
