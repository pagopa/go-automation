/**
 * Owns the script-specific tables on top of `GOFtsIndex`:
 *   - `attachments` : metadata + sync status for every attachment ever seen
 *   - `issues`      : per-issue snapshot (for status reporting, not search)
 *   - `sync_state`  : key/value bookkeeping (last sync timestamp, etc.)
 *
 * `GOFtsIndex` provides the configured FTS5 virtual table (`attachments_fts`) and the
 * metadata side-table; this class layers our domain tables alongside.
 *
 * Schema version is tracked via `GOFtsIndex.setSchemaVersion()` and migrated
 * forward in `ensureSchema()`. Currently at version 1.
 */
import type { Core } from '@go-automation/go-common';

const CURRENT_SCHEMA_VERSION = 1;

export class IndexSchemaManager {
  constructor(private readonly index: Core.GOFtsIndex) {}

  public ensureSchema(): void {
    const db = this.index.getDatabase();

    db.exec(`
      CREATE TABLE IF NOT EXISTS attachments (
        attachment_id    TEXT PRIMARY KEY,
        issue_key        TEXT NOT NULL,
        issue_summary    TEXT NOT NULL,
        project_key      TEXT NOT NULL,
        filename         TEXT NOT NULL,
        mime_type        TEXT NOT NULL,
        size_bytes       INTEGER NOT NULL,
        created_at       TEXT NOT NULL,
        author           TEXT,
        content_url      TEXT NOT NULL,
        content_hash     TEXT,
        status           TEXT NOT NULL,
        status_reason    TEXT,
        indexed_at       TEXT,
        last_synced_at   TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_attachments_issue_key   ON attachments(issue_key);
      CREATE INDEX IF NOT EXISTS idx_attachments_project_key ON attachments(project_key);
      CREATE INDEX IF NOT EXISTS idx_attachments_status      ON attachments(status);

      CREATE TABLE IF NOT EXISTS issues (
        issue_key      TEXT PRIMARY KEY,
        project_key    TEXT NOT NULL,
        summary        TEXT NOT NULL,
        updated_at     TEXT NOT NULL,
        last_synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const previousVersion = this.index.getSchemaVersion();
    if (previousVersion < CURRENT_SCHEMA_VERSION) {
      this.index.setSchemaVersion(CURRENT_SCHEMA_VERSION);
    }
  }

  public getSchemaVersion(): number {
    return this.index.getSchemaVersion();
  }
}
