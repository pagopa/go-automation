import type { GOLogEvent } from '../../GOLogEvent.js';
import type { GOLoggerHandler } from '../../GOLoggerHandler.js';

/**
 * Logger handler that records every event and counts resets.
 */
export class RecordingLoggerHandler implements GOLoggerHandler {
  public readonly events: GOLogEvent[] = [];
  public resets = 0;

  /**
   * Records the event.
   *
   * @param event - The event to record
   */
  handle(event: GOLogEvent): void {
    this.events.push(event);
  }

  /** Counts the reset. */
  async reset(): Promise<void> {
    this.resets += 1;
    return Promise.resolve();
  }
}
