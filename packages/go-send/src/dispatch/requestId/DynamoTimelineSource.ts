import type { SENDTimelineElement } from '../../services/timeline/models/SENDTimelineElement.js';
import type { SENDTimelineService } from '../../services/timeline/SENDTimelineService.js';
import type { TimelineSource } from './TimelineSource.js';

/**
 * {@link TimelineSource} backed by `pn-Timelines` (one paginated query per
 * check, projection limited to id, category and timestamp).
 */
export class DynamoTimelineSource implements TimelineSource {
  constructor(private readonly service: SENDTimelineService) {}

  /**
   * Reads the timeline of a notification.
   *
   * @param iun - IUN of the notification
   * @returns Elements sorted by instant, then by id
   */
  public async query(iun: string): Promise<ReadonlyArray<SENDTimelineElement>> {
    return this.service.queryTimelineElements(iun);
  }
}
