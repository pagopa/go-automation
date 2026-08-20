import type { OccurrenceTimeWindow } from '@go-automation/go-runbook';

/**
 * Identity + structural fingerprint of a runbook definition, computed once per
 * run from the registry builder (no AWS calls). Used to invalidate the resume
 * cache when the runbook changes.
 */
export interface RunbookCacheDescriptor {
  /** Runbook id (`metadata.id`, equals the alarm name). */
  readonly id: string;
  /** Runbook semantic version (`metadata.version`). */
  readonly version: string;
  /** SHA-256 of the serializable runbook structure (known cases, steps, …). */
  readonly hash: string;
  /** Resolved occurrence window, including the catalog default when omitted. */
  readonly occurrenceTimeWindow: OccurrenceTimeWindow;
}
