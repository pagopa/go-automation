import type { Runbook } from '../../../engine/index.js';

/** Builds a runbook definition; must be pure so that its definition digest is stable. */
export type RunbookBuilderFn = () => Runbook;
