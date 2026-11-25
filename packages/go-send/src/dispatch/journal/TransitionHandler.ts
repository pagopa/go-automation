import type { JournalEntry } from './JournalEntry.js';

/**
 * Observer of every recorded transition (logging, `--verbose`). Called
 * after the entry is journaled; must not throw.
 */
export type TransitionHandler = (entry: JournalEntry) => void;
