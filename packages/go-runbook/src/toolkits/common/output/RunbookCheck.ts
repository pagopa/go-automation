import type { RunbookResultField } from './RunbookResultField.js';
import type { CoverageReason } from '../../../engine/index.js';
import type { RunbookCheckStatus } from './RunbookCheckStatus.js';

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
