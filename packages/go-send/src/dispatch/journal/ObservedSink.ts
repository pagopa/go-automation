import type { JournalEntry } from './JournalEntry.js';
import type { JournalSink } from './JournalSink.js';
import type { TransitionHandler } from './TransitionHandler.js';

/**
 * Journal sink that forwards every entry to the journal (if any) and then to
 * an observer. In a dry run there is no journal, but the observer still sees
 * the transitions (e.g. `ROW_INVALID`).
 */
export class ObservedSink implements JournalSink {
  constructor(
    private readonly inner: JournalSink | undefined,
    private readonly observer: TransitionHandler,
  ) {}

  public async append(entry: JournalEntry): Promise<void> {
    await this.inner?.append(entry);
    this.observer(entry);
  }
}
