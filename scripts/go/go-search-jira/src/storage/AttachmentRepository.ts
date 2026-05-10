/**
 * Persistence helper for the `attachments` and `issues` tables. Wraps the
 * raw better-sqlite3 statements behind a small typed API used by the sync
 * orchestrator and the status command.
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

export interface AttachmentStatusUpdate {
  readonly status: AttachmentSyncStatusValue;
  readonly statusReason: string | null;
  readonly contentHash?: string | null;
  readonly indexedAt?: string | null;
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

interface ValueRow {
  readonly value: string;
}

export class AttachmentRepository {
  private readonly db: Core.GOSqliteDatabase;

  constructor(index: Core.GOFtsIndex) {
    this.db = index.getDatabase();
  }

  public hasAttachment(attachmentId: string): boolean {
    const stmt = this.db.prepare<[string], IdRow>('SELECT attachment_id FROM attachments WHERE attachment_id = ?');
    const row = stmt.get(attachmentId);
    return row !== undefined;
  }

  public getAttachment(attachmentId: string): AttachmentRow | undefined {
    const stmt = this.db.prepare<[string], RawAttachmentRow>('SELECT * FROM attachments WHERE attachment_id = ?');
    const row = stmt.get(attachmentId);
    return row !== undefined ? toAttachmentRow(row) : undefined;
  }

  public upsertAttachmentMetadata(
    issue: JiraIssue,
    attachment: JiraAttachment,
    status: AttachmentSyncStatusValue,
    statusReason: string | null,
    nowIso: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO attachments(
           attachment_id, issue_key, issue_summary, project_key,
           filename, mime_type, size_bytes, created_at, author,
           content_url, content_hash, status, status_reason,
           indexed_at, last_synced_at
         )
         VALUES(
           @attachment_id, @issue_key, @issue_summary, @project_key,
           @filename, @mime_type, @size_bytes, @created_at, @author,
           @content_url, NULL, @status, @status_reason,
           NULL, @last_synced_at
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
           status          = excluded.status,
           status_reason   = excluded.status_reason,
           last_synced_at  = excluded.last_synced_at`,
      )
      .run({
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
        status,
        status_reason: statusReason,
        last_synced_at: nowIso,
      });
  }

  public updateAttachmentStatus(attachmentId: string, update: AttachmentStatusUpdate): void {
    this.db
      .prepare(
        `UPDATE attachments
         SET status         = @status,
             status_reason  = @status_reason,
             content_hash   = COALESCE(@content_hash, content_hash),
             indexed_at     = COALESCE(@indexed_at, indexed_at)
         WHERE attachment_id = @attachment_id`,
      )
      .run({
        attachment_id: attachmentId,
        status: update.status,
        status_reason: update.statusReason,
        content_hash: update.contentHash ?? null,
        indexed_at: update.indexedAt ?? null,
      });
  }

  public upsertIssue(issue: JiraIssue, nowIso: string): void {
    this.db
      .prepare(
        `INSERT INTO issues(issue_key, project_key, summary, updated_at, last_synced_at)
         VALUES(@issue_key, @project_key, @summary, @updated_at, @last_synced_at)
         ON CONFLICT(issue_key) DO UPDATE SET
           project_key    = excluded.project_key,
           summary        = excluded.summary,
           updated_at     = excluded.updated_at,
           last_synced_at = excluded.last_synced_at`,
      )
      .run({
        issue_key: issue.key,
        project_key: issue.projectKey,
        summary: issue.summary,
        updated_at: issue.updated,
        last_synced_at: nowIso,
      });
  }

  public countIssues(): number {
    const stmt = this.db.prepare<[], CountRow>('SELECT COUNT(*) AS c FROM issues');
    const row = stmt.get();
    return row?.c ?? 0;
  }

  public statusBreakdown(): AttachmentStatusBreakdown {
    const stmt = this.db.prepare<[], StatusCountRow>('SELECT status, COUNT(*) AS c FROM attachments GROUP BY status');
    const rows = stmt.all();
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
    const stmt = this.db.prepare<[], MimeCountRow>(
      `SELECT mime_type AS mimeType, COUNT(*) AS count
         FROM attachments WHERE status = 'indexed'
         GROUP BY mime_type ORDER BY count DESC`,
    );
    return stmt.all();
  }

  public skipReasonBreakdown(): ReadonlyArray<{ readonly reason: string; readonly count: number }> {
    const stmt = this.db.prepare<[], ReasonCountRow>(
      `SELECT COALESCE(status_reason, 'unknown') AS reason, COUNT(*) AS count
         FROM attachments WHERE status = 'skipped'
         GROUP BY reason ORDER BY count DESC`,
    );
    return stmt.all();
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
    const stmt = this.db.prepare<[], { readonly reason: string; readonly mimeType: string; readonly count: number }>(
      `SELECT COALESCE(status_reason, 'unknown') AS reason,
              mime_type AS mimeType,
              COUNT(*) AS count
         FROM attachments WHERE status = 'skipped'
         GROUP BY reason, mime_type
         ORDER BY count DESC`,
    );
    return stmt.all();
  }

  public getLastSync(): string | undefined {
    const stmt = this.db.prepare<[], ValueRow>("SELECT value FROM sync_state WHERE key = 'last_sync_at'");
    const row = stmt.get();
    return row?.value;
  }

  public setLastSync(nowIso: string): void {
    this.db
      .prepare(
        `INSERT INTO sync_state(key, value) VALUES('last_sync_at', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(nowIso);
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
