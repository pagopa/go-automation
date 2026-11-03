import type { DispatchGroup } from '../model/DispatchGroup.js';

/**
 * Reads the groups of the PA owning the API key (one B2B call).
 */
export type GroupsFetchFn = () => Promise<ReadonlyArray<DispatchGroup>>;
