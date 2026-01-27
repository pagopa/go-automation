/**
 * SEND Timeline Result - Complete timeline data for a single IUN
 */

import type { SENDTimelineElement } from './SENDTimelineElement.js';

/**
 * Represents the complete timeline result for a single IUN
 *
 * @example
 * ```typescript
 * const result: SENDTimelineResult = {
 *   iun: 'ABCD-1234-5678',
 *   paId: 'pa-12345',
 *   notificationSentAt: '2024-01-15T09:00:00.000Z',
 *   timeline: [
 *     { timelineElementId: '...', category: 'REQUEST_ACCEPTED', timestamp: '...' },
 *   ],
 * };
 * ```
 */
export interface SENDTimelineResult {
  /** The IUN (Identificativo Univoco Notifica) */
  readonly iun: string;

  /** The PA (Pubblica Amministrazione) identifier */
  readonly paId: string | null;

  /** Timestamp when the notification was sent (ISO 8601 format) */
  readonly notificationSentAt: string | null;

  /** Array of timeline elements, sorted by timestamp */
  readonly timeline: ReadonlyArray<SENDTimelineElement>;
}
