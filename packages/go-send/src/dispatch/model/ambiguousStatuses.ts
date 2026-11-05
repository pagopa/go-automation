import type { RowStatus } from './RowStatus.js';

/**
 * Statuses of a row SEND may have received without the run knowing the
 * outcome: a resume reconciles them (protocol lookup) instead of POSTing,
 * and a row whose mapping no longer builds stays visible as uncertain.
 */
export const AMBIGUOUS_STATUSES: ReadonlySet<RowStatus> = new Set<RowStatus>([
  'SENDING',
  'RECONCILING',
  'SEND_UNCERTAIN',
]);
