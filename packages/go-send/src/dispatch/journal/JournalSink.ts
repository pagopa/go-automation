import type { JournalEntry } from './JournalEntry.js';

/**
 * Destination of journal entries: the run {@link ./Journal.Journal}, or
 * nothing in a dry run.
 */
export interface JournalSink {
  append(entry: JournalEntry): Promise<void>;
}
