/** Per-occurrence input. */
export interface ExecuteRunbookForOccurrenceInput {
  readonly alarmName: string;
  /** Stable registry key pinned by the managed cloud command. */
  readonly runbookKey?: string;
  /** Occurrence timestamp (ISO 8601) used as `alarmDatetime`. */
  readonly firedAt: string;
  /** Optional last-occurrence timestamp (ISO 8601) for multi-occurrence mode. */
  readonly alarmDatetimeEnd?: string;
  /** Source account queried through OAM. */
  readonly awsAccountId: string;
  /** AWS region of the occurrence and OAM sink/link. */
  readonly region: string;
  readonly awsProfiles: ReadonlyArray<string>;
  /** Managed cloud execution enforces the read-only v1 policy. */
  readonly executionMode?: 'local' | 'cloud';
  /** Cooperative cancellation propagated into the engine and services. */
  readonly signal?: AbortSignal;
}
