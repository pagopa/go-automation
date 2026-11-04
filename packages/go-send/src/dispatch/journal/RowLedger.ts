import { acceptanceOf } from '../model/acceptanceOf.js';
import type { RowAcceptance } from '../model/RowAcceptance.js';
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
 * Memory is O(rows) on compact {@link RowState} objects only; the count of
 * rows per status is kept up to date on every transition, so a progress
 * snapshot never rescans the rows.
 */
export class RowLedger {
  private readonly rows = new Map<number, RowState>();
  private readonly statusCounts = new Map<RowStatus, number>();
  private readonly acceptanceCounts = new Map<RowAcceptance, number>();
  private readonly uploads: RecordedUpload[] = [];

  constructor(
    private readonly sink: JournalSink | undefined,
    private readonly now: WallClockFn = (): Date => new Date(),
  ) {}

  /**
   * Rebuilds a ledger from journal entries (resume), consuming them as a
   * stream: replayed entries are never appended to `sink`.
   *
   * @param entries - Entries read from the journal (e.g. `Journal.entries`)
   * @param sink - Journal to append new entries to; `undefined` for a
   *   read-only ledger (dry run)
   * @param now - Wall clock of the new entries
   * @returns Ledger with the replayed state
   */
  public static async replay(
    entries: AsyncIterable<JournalEntry> | Iterable<JournalEntry>,
    sink: JournalSink | undefined,
    now?: WallClockFn,
  ): Promise<RowLedger> {
    const ledger = new RowLedger(sink, now);
    for await (const entry of entries) ledger.apply(entry);
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

  /**
   * Number of rows per status (statuses without rows are absent). O(statuses).
   *
   * @returns A snapshot: later transitions do not change it
   */
  public countByStatus(): ReadonlyMap<RowStatus, number> {
    return new Map(this.statusCounts);
  }

  /**
   * Number of rows per SEND acceptance ({@link acceptanceOf}; values without
   * rows are absent), kept up to date on every entry.
   *
   * @returns A snapshot: later transitions do not change it
   */
  public countByAcceptance(): ReadonlyMap<RowAcceptance, number> {
    return new Map(this.acceptanceCounts);
  }

  private apply(entry: JournalEntry): RowState | undefined {
    if (entry.event === 'DOCUMENT_UPLOADED' && entry.upload !== undefined) {
      this.uploads.push({ ...entry.upload, ts: entry.ts });
      return undefined;
    }
    if (entry.rowIndex === undefined) return undefined;
    const previous = this.rows.get(entry.rowIndex);
    const next = applyJournalEntry(previous, entry);
    if (next !== undefined && next !== previous) {
      this.rows.set(entry.rowIndex, next);
      if (previous?.status !== next.status) {
        if (previous !== undefined) adjustCount(this.statusCounts, previous.status, -1);
        adjustCount(this.statusCounts, next.status, 1);
      }
      const previousAcceptance = previous === undefined ? undefined : acceptanceOf(previous);
      const nextAcceptance = acceptanceOf(next);
      if (previousAcceptance !== nextAcceptance) {
        if (previousAcceptance !== undefined) adjustCount(this.acceptanceCounts, previousAcceptance, -1);
        adjustCount(this.acceptanceCounts, nextAcceptance, 1);
      }
    }
    return next;
  }
}

/** Adds `delta` to the count of `key`, dropping keys that reach zero. */
function adjustCount<K>(counts: Map<K, number>, key: K, delta: number): void {
  const count = (counts.get(key) ?? 0) + delta;
  if (count > 0) counts.set(key, count);
  else counts.delete(key);
}
