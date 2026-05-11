/**
 * Aggregate report produced at the end of a `sync` run.
 */
export interface AttachmentSyncReport {
  readonly issuesProcessed: number;
  readonly indexed: number;
  readonly plannedDownloads: number;
  readonly skipped: number;
  readonly failed: number;
  readonly deleted: number;
  readonly bytesDownloaded: number;
  readonly durationMs: number;
  readonly errors: ReadonlyArray<{
    readonly attachmentId: string;
    readonly issueKey: string;
    readonly message: string;
  }>;
}
