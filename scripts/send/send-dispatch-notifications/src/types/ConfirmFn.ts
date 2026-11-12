import type { ConfirmOutcome } from './ConfirmOutcome.js';

/** Asks the operator to confirm the run. */
export type ConfirmFn = () => Promise<ConfirmOutcome>;
