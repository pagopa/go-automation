import type { RunbookMetadata } from '../../../engine/index.js';
import type { OccurrenceTimeWindow } from '../time/occurrence/OccurrenceTimeWindow.js';

/**
 * The part of an alarm config every toolkit builder starts from. Declared structurally so each family can pass its
 * own config object.
 */
export interface AlarmRunbookHeadConfig {
  readonly id: string;
  readonly metadata: Omit<RunbookMetadata, 'id'>;
  readonly occurrenceTimeWindow?: OccurrenceTimeWindow;
}
