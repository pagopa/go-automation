import type { JournalEntry } from '../../journal/JournalEntry.js';
import type { JournalSink } from '../../journal/JournalSink.js';

/** Journal sink that keeps entries in memory. */
export class MemorySink implements JournalSink {
  public readonly entries: JournalEntry[] = [];

  public async append(entry: JournalEntry): Promise<void> {
    this.entries.push(entry);
    await Promise.resolve();
  }

  /** Entries of one event. */
  public events(event: string): ReadonlyArray<JournalEntry> {
    return this.entries.filter((entry) => entry.event === event);
  }
}
