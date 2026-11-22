/** Stable top-level classification shared by automation consumers. */
export type RunbookCheckStatus =
  'HIT' | 'MISS' | 'INCONCLUSIVE' | 'NO-DATA' | 'NO_RUNBOOK' | 'CONFIG-ERROR' | 'EXECUTION-ERROR';
