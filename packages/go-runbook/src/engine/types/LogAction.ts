import type { LogActionRow } from './LogActionRow.js';
import type { LogActionLevel } from './LogActionLevel.js';

/**
 * Log the result (for informational cases).
 *
 * The action carries the structure it wants rendered rather than a
 * pre-serialised block of text: the console renders a table from
 * {@link title} and {@link details} directly, and the string published in
 * the runbook output is produced from the same two fields.
 */
export interface LogAction {
  readonly type: 'log';
  readonly level: LogActionLevel;
  /** What happened, without any prefix: the renderer adds the marker. */
  readonly title: string;
  /** Evidence rows rendered under the title. */
  readonly details?: ReadonlyArray<LogActionRow>;
  /**
   * Rendering hint, opaque to the engine: the injected {@link LogActionRenderer}
   * interprets it (the analysis renderer knows `known-case` and `unknown-case`).
   * The key keeps its name because it is part of the definition digest.
   */
  readonly renderAs?: string;
}
