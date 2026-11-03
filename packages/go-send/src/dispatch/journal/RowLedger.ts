import type { RowState } from '../model/RowState.js';
import type { RowStatus } from '../model/RowStatus.js';
import { applyJournalEntry } from './applyJournalEntry.js';
import type { JournalEntry } from './JournalEntry.js';
import type { JournalSink } from './JournalSink.js';
import type { RecordedUpload } from './RecordedUpload.js';
import type { WallClockFn } from '../model/WallClockFn.js';

/**
 * Single source of truth of a run: applies every entry to the in-memory
 * state **and** appends it to the journal, so the two cannot diverge.
 *
 * Memory is O(rows) on compact {@link RowState} objects only.
 */
export class RowLedger {
  private readonly rows = new Map<number, RowState>();
  private readonly uploads: RecordedUpload[] = [];

  constructor(
    private readonly sink: JournalSink | undefined,
    private readonly now: WallClockFn = (): Date => new Date(),
  ) {}

  /**
   * Rebuilds a ledger from journal entries (resume).
   *
   * @param entries - Entries read from the journal
   * @param sink - Journal to append new entries to
   * @returns Ledger with the replayed state
   */
  public static replay(entries: ReadonlyArray<JournalEntry>, sink: JournalSink | undefined): RowLedger {
    const ledger = new RowLedger(sink);
    for (const entry of entries) ledger.apply(entry);
    return ledger;
  }

  /**
   * Records a transition: updates the state, then appends to the journal.
   *
   * @param entry - Entry without timestamp (added here)
   * @returns The new state of the row, if the entry is row-level
   */
  public async record(entry: Omit<JournalEntry, 'ts'>): Promise<RowState | undefined> {
    const stamped: JournalEntry = { ts: this.now().toISOString(), ...entry };
    const state = this.apply(stamped);
    await this.sink?.append(stamped);
    return state;
  }

  /** State of a row, if any transition was recorded. */
  public get(rowIndex: number): RowState | undefined {
    return this.rows.get(rowIndex);
  }

  /** All row states, in no particular order. */
  public values(): IterableIterator<RowState> {
    return this.rows.values();
  }

  /** Uploads recorded so far, with their timestamp (for the upload cache). */
  public recordedUploads(): ReadonlyArray<RecordedUpload> {
    return this.uploads;
  }

  /** Number of rows per status. */
  public countByStatus(): ReadonlyMap<RowStatus, number> {
    const counts = new Map<RowStatus, number>();
    for (const state of this.rows.values()) counts.set(state.status, (counts.get(state.status) ?? 0) + 1);
    return counts;
  }

  private apply(entry: JournalEntry): RowState | undefined {
    if (entry.event === 'DOCUMENT_UPLOADED' && entry.upload !== undefined) {
      this.uploads.push({ ...entry.upload, ts: entry.ts });
      return undefined;
    }
    if (entry.rowIndex === undefined) return undefined;
    const next = applyJournalEntry(this.rows.get(entry.rowIndex), entry);
    if (next !== undefined) this.rows.set(entry.rowIndex, next);
    return next;
  }
}
