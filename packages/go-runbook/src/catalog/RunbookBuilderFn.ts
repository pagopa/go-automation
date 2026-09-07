import type { Runbook } from '../types/Runbook.js';

/** Builds a runbook definition; must be pure so that its definition digest is stable. */
export type RunbookBuilderFn = () => Runbook;
