import type { CaseAction } from '../../../engine/index.js';

/** Builds the fallback used when the config declares none. */
export type DefaultFallbackFn = () => CaseAction;
