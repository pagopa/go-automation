import type { RunbookResultField } from './RunbookOutputContext.js';
import type { CoverageReason } from '../../../engine/types/CoverageReason.js';

/** Stable top-level classification shared by automation consumers. */
export type RunbookCheckStatus =
  'HIT' | 'MISS' | 'INCONCLUSIVE' | 'NO-DATA' | 'NO_RUNBOOK' | 'CONFIG-ERROR' | 'EXECUTION-ERROR';

/** Classification of one runbook execution with bounded supporting fields. */
export interface RunbookCheck {
  readonly status: RunbookCheckStatus;
  readonly outcomeKind?: string;
  /** Ids of the detections, in time order. */
  readonly matchedCaseIds: ReadonlyArray<string>;
  /** Incomplete sources of the evidence, by reason; absent when the evidence is complete. */
  readonly incompleteSources?: Readonly<Partial<Record<CoverageReason, number>>>;
  readonly durationMs?: number;
  readonly cloudWatchRecordsScanned?: number;
  readonly cloudWatchBytesScanned?: number;
  readonly error?: string;
  /**
   * Operator-facing evidence, carried only for outcomes that need diagnosing
   * (`MISS`, `INCONCLUSIVE` and `NO-DATA`).
   *
   * Without it a coverage report says *that* a runbook recognised nothing but
   * never *why*, which is the one thing needed to write the missing known case.
   * Bounded by construction: these are the same summary fields the unknown-case
   * fallback renders, not raw log rows.
   */
  readonly fields?: ReadonlyArray<RunbookResultField>;
  /** Message rendered by the unknown-case fallback, when the runbook has one. */
  readonly fallbackMessage?: string;
}

/** Classification returned after an engine run; no-runbook is decided before execution. */
export type ClassifiedRunbookCheck = Omit<RunbookCheck, 'status'> & {
  readonly status: Exclude<RunbookCheckStatus, 'NO_RUNBOOK'>;
};
