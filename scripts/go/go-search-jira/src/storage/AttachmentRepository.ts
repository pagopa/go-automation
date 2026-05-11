/**
 * Persistence helper for the `attachments` and `issues` tables. Wraps the
 * raw better-sqlite3 statements behind a small typed API used by the sync
 * orchestrator and the status command.
 *
 * All prepared statements are built once in the constructor and reused on
 * every call — `db.prepare(...)` is non-trivial in better-sqlite3 (SQL
 * planning, parameter analysis) and these methods are on the sync hot path.
 */
import type { Core } from '@go-automation/go-common';

import type { AttachmentSyncStatusValue } from '../types/AttachmentSyncStatus.js';
import type { JiraAttachment } from '../types/JiraAttachment.js';
import type { JiraIssue } from '../types/JiraIssue.js';

export interface AttachmentRow {
  readonly attachmentId: string;
  readonly issueKey: string;
  readonly issueSummary: string;
  readonly projectKey: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly author: string | null;
  readonly contentUrl: string;
  readonly contentHash: string | null;
  readonly status: AttachmentSyncStatusValue;
  readonly statusReason: string | null;
  readonly indexedAt: string | null;
  readonly lastSyncedAt: string;
}

export interface AttachmentStatusBreakdown {
  readonly indexed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly deleted: number;
}

interface RawAttachmentRow {
  readonly attachment_id: string;
  readonly issue_key: string;
  readonly issue_summary: string;
  readonly project_key: string;
  readonly filename: string;
  readonly mime_type: string;
  readonly size_bytes: number;
  readonly created_at: string;
  readonly author: string | null;
  readonly content_url: string;
  readonly content_hash: string | null;
  readonly status: AttachmentSyncStatusValue;
  readonly status_reason: string | null;
  readonly indexed_at: string | null;
  readonly last_synced_at: string;
}

interface IdRow {
  readonly attachment_id: string;
}

interface CountRow {
  readonly c: number;
}

interface StatusCountRow {
  readonly status: string;
  readonly c: number;
}

interface MimeCountRow {
  readonly mimeType: string;
  readonly count: number;
}

interface ReasonCountRow {
  readonly reason: string;
  readonly count: number;
}

interface ReasonMimeCountRow {
  readonly reason: string;
  readonly mimeType: string;
  readonly count: number;
}

interface ValueRow {
  readonly value: string;
}

interface UpsertAttachmentBind {
  readonly attachment_id: string;
  readonly issue_key: string;
  readonly issue_summary: string;
  readonly project_key: string;
  readonly filename: string;
  readonly mime_type: string;
  readonly size_bytes: number;
  readonly created_at: string;
  readonly author: string | null;
  readonly content_url: string;
  readonly content_hash: string | null;
  readonly status: AttachmentSyncStatusValue;
  readonly status_reason: string | null;
  readonly indexed_at: string | null;
  readonly last_synced_at: string;
}

/**
 * Optional outcome fields persisted alongside the bookkeeping row. Defaults to
 * "no hash / not indexed yet" — appropriate for skip/dry-run/download-fail
 * paths that never produced a content hash.
 */
export interface AttachmentOutcome {
  readonly contentHash: string | null;
  readonly indexedAt: string | null;
}

const NO_OUTCOME: AttachmentOutcome = { contentHash: null, indexedAt: null };

interface UpsertIssueBind {
  readonly issue_key: string;
  readonly project_key: string;
  readonly summary: string;
  readonly updated_at: string;
  readonly last_synced_at: string;
}

export class AttachmentRepository {
  private readonly hasAttachmentStmt: Core.GOSqliteStatement<[string], IdRow>;
  private readonly getAttachmentStmt: Core.GOSqliteStatement<[string], RawAttachmentRow>;
  private readonly upsertAttachmentStmt: Core.GOSqliteStatement<[UpsertAttachmentBind]>;
  private readonly upsertIssueStmt: Core.GOSqliteStatement<[UpsertIssueBind]>;
  private readonly countIssuesStmt: Core.GOSqliteStatement<[], CountRow>;
  private readonly statusBreakdownStmt: Core.GOSqliteStatement<[], StatusCountRow>;
  private readonly mimeTypeBreakdownStmt: Core.GOSqliteStatement<[], MimeCountRow>;
  private readonly skipReasonBreakdownStmt: Core.GOSqliteStatement<[], ReasonCountRow>;
  private readonly skipMimeBreakdownStmt: Core.GOSqliteStatement<[], ReasonMimeCountRow>;
  private readonly getLastSyncStmt: Core.GOSqliteStatement<[], ValueRow>;
  private readonly setLastSyncStmt: Core.GOSqliteStatement<[string]>;

  constructor(index: Core.GOFtsIndex) {
    const db = index.getDatabase();

    this.hasAttachmentStmt = db.prepare<[string], IdRow>(
      'SELECT attachment_id FROM attachments WHERE attachment_id = ?',
    );
    this.getAttachmentStmt = db.prepare<[string], RawAttachmentRow>(
      'SELECT * FROM attachments WHERE attachment_id = ?',
    );

    this.upsertAttachmentStmt = db.prepare<UpsertAttachmentBind>(
      `INSERT INTO attachments(
         attachment_id, issue_key, issue_summary, project_key,
         filename, mime_type, size_bytes, created_at, author,
         content_url, content_hash, status, status_reason,
         indexed_at, last_synced_at
       )
       VALUES(
         @attachment_id, @issue_key, @issue_summary, @project_key,
         @filename, @mime_type, @size_bytes, @created_at, @author,
         @content_url, @content_hash, @status, @status_reason,
         @indexed_at, @last_synced_at
       )
       ON CONFLICT(attachment_id) DO UPDATE SET
         issue_key       = excluded.issue_key,
         issue_summary   = excluded.issue_summary,
         project_key     = excluded.project_key,
         filename        = excluded.filename,
         mime_type       = excluded.mime_type,
         size_bytes      = excluded.size_bytes,
         created_at      = excluded.created_at,
         author          = excluded.author,
         content_url     = excluded.content_url,
         content_hash    = COALESCE(excluded.content_hash, attachments.content_hash),
         status          = excluded.status,
         status_reason   = excluded.status_reason,
         indexed_at      = COALESCE(excluded.indexed_at, attachments.indexed_at),
         last_synced_at  = excluded.last_synced_at`,
    );

    this.upsertIssueStmt = db.prepare<UpsertIssueBind>(
      `INSERT INTO issues(issue_key, project_key, summary, updated_at, last_synced_at)
       VALUES(@issue_key, @project_key, @summary, @updated_at, @last_synced_at)
       ON CONFLICT(issue_key) DO UPDATE SET
         project_key    = excluded.project_key,
         summary        = excluded.summary,
         updated_at     = excluded.updated_at,
         last_synced_at = excluded.last_synced_at`,
    );

    this.countIssuesStmt = db.prepare<[], CountRow>('SELECT COUNT(*) AS c FROM issues');
    this.statusBreakdownStmt = db.prepare<[], StatusCountRow>(
      'SELECT status, COUNT(*) AS c FROM attachments GROUP BY status',
    );
    this.mimeTypeBreakdownStmt = db.prepare<[], MimeCountRow>(
      `SELECT mime_type AS mimeType, COUNT(*) AS count
         FROM attachments WHERE status = 'indexed'
         GROUP BY mime_type ORDER BY count DESC`,
    );
    this.skipReasonBreakdownStmt = db.prepare<[], ReasonCountRow>(
      `SELECT COALESCE(status_reason, 'unknown') AS reason, COUNT(*) AS count
         FROM attachments WHERE status = 'skipped'
         GROUP BY reason ORDER BY count DESC`,
    );
    this.skipMimeBreakdownStmt = db.prepare<[], ReasonMimeCountRow>(
      `SELECT COALESCE(status_reason, 'unknown') AS reason,
              mime_type AS mimeType,
              COUNT(*) AS count
         FROM attachments WHERE status = 'skipped'
         GROUP BY reason, mime_type
         ORDER BY count DESC`,
    );

    this.getLastSyncStmt = db.prepare<[], ValueRow>("SELECT value FROM sync_state WHERE key = 'last_sync_at'");
    this.setLastSyncStmt = db.prepare<[string]>(
      `INSERT INTO sync_state(key, value) VALUES('last_sync_at', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
  }

  public hasAttachment(attachmentId: string): boolean {
    return this.hasAttachmentStmt.get(attachmentId) !== undefined;
  }

  public getAttachment(attachmentId: string): AttachmentRow | undefined {
    const row = this.getAttachmentStmt.get(attachmentId);
    return row !== undefined ? toAttachmentRow(row) : undefined;
  }

  /**
   * Writes the bookkeeping row for an attachment in a single shot — no
   * intermediate placeholder row. The `outcome` parameter carries the
   * `contentHash` / `indexedAt` produced by the indexer when applicable;
   * skip / dry-run / download-fail paths pass the default `NO_OUTCOME`
   * (both null) and the existing values, if any, are preserved by the
   * `COALESCE(excluded.x, attachments.x)` clause on conflict.
   */
  public upsertAttachmentMetadata(
    issue: JiraIssue,
    attachment: JiraAttachment,
    status: AttachmentSyncStatusValue,
    statusReason: string | null,
    nowIso: string,
    outcome: AttachmentOutcome = NO_OUTCOME,
  ): void {
    this.upsertAttachmentStmt.run({
      attachment_id: attachment.id,
      issue_key: issue.key,
      issue_summary: issue.summary,
      project_key: issue.projectKey,
      filename: attachment.filename,
      mime_type: attachment.mimeType,
      size_bytes: attachment.size,
      created_at: attachment.created,
      author: attachment.author ?? null,
      content_url: attachment.contentUrl,
      content_hash: outcome.contentHash,
      status,
      status_reason: statusReason,
      indexed_at: outcome.indexedAt,
      last_synced_at: nowIso,
    });
  }

  public upsertIssue(issue: JiraIssue, nowIso: string): void {
    this.upsertIssueStmt.run({
      issue_key: issue.key,
      project_key: issue.projectKey,
      summary: issue.summary,
      updated_at: issue.updated,
      last_synced_at: nowIso,
    });
  }

  public countIssues(): number {
    return this.countIssuesStmt.get()?.c ?? 0;
  }

  public statusBreakdown(): AttachmentStatusBreakdown {
    const rows = this.statusBreakdownStmt.all();
    const breakdown: { indexed: number; skipped: number; failed: number; deleted: number } = {
      indexed: 0,
      skipped: 0,
      failed: 0,
      deleted: 0,
    };
    for (const row of rows) {
      if (row.status === 'indexed') breakdown.indexed = row.c;
      else if (row.status === 'skipped') breakdown.skipped = row.c;
      else if (row.status === 'failed') breakdown.failed = row.c;
      else if (row.status === 'deleted') breakdown.deleted = row.c;
    }
    return breakdown;
  }

  public mimeTypeBreakdown(): ReadonlyArray<{ readonly mimeType: string; readonly count: number }> {
    return this.mimeTypeBreakdownStmt.all();
  }

  public skipReasonBreakdown(): ReadonlyArray<{ readonly reason: string; readonly count: number }> {
    return this.skipReasonBreakdownStmt.all();
  }

  /**
   * Returns the count of skipped attachments grouped by (reason, mime_type).
   * Useful for diagnosing which file formats are unsupported on a corpus.
   */
  public skipMimeBreakdown(): ReadonlyArray<{
    readonly reason: string;
    readonly mimeType: string;
    readonly count: number;
  }> {
    return this.skipMimeBreakdownStmt.all();
  }

  public getLastSync(): string | undefined {
    return this.getLastSyncStmt.get()?.value;
  }

  public setLastSync(nowIso: string): void {
    this.setLastSyncStmt.run(nowIso);
  }
}

function toAttachmentRow(row: RawAttachmentRow): AttachmentRow {
  return {
    attachmentId: row.attachment_id,
    issueKey: row.issue_key,
    issueSummary: row.issue_summary,
    projectKey: row.project_key,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    author: row.author,
    contentUrl: row.content_url,
    contentHash: row.content_hash,
    status: row.status,
    statusReason: row.status_reason,
    indexedAt: row.indexed_at,
    lastSyncedAt: row.last_synced_at,
  };
}
