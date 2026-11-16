import type { InteropEnvironment } from './InteropEnvironment.js';

/** Every INTEROP environment, production first. */
export const INTEROP_ENVIRONMENTS: readonly [InteropEnvironment, ...InteropEnvironment[]] = ['prod', 'att', 'test'];
