import type { SENDTimelineElement } from '../../services/timeline/models/SENDTimelineElement.js';

/**
 * Reads the timeline of a notification (one query); faked in tests.
 */
export interface TimelineSource {
  query(iun: string): Promise<ReadonlyArray<SENDTimelineElement>>;
}
