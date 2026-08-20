/**
 * Inputs that determine a cached runbook result. The cache fingerprint is the
 * hash of this object; if any field changes, the cached entry is considered
 * stale and the runbook is re-executed.
 */
export interface CachedRunbookMeta {
  /** Local cache-format lever: bump to invalidate every entry at once. */
  readonly fingerprintVersion: number;
  /** Runbook id (= alarm name). */
  readonly runbookId: string;
  /** Runbook semantic version. */
  readonly runbookVersion: string;
  /** SHA-256 of the serializable runbook definition. */
  readonly runbookHash: string;
  /** `RunbookOutput` schema version the entry was produced with. */
  readonly outputSchemaVersion: string;
  /** AWS account targeted by the execution. */
  readonly awsAccountId: string;
  /** AWS region targeted by the execution. */
  readonly awsRegion: string;
  /** AWS profiles used for the execution (sorted, order-insensitive). */
  readonly awsProfiles: ReadonlyArray<string>;
  /** Occurrence timestamp (drives the CloudWatch time window). */
  readonly firedAt: string;
  /** Time-window size (minutes) applied around `firedAt`. */
  readonly windowMinutes: number;
}
