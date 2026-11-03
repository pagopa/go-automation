import type { SENDTimelineElement } from '../../services/timeline/models/SENDTimelineElement.js';
import type { SENDTimelineService } from '../../services/timeline/SENDTimelineService.js';
import type { TimelineSource } from './TimelineSource.js';

/**
 * {@link TimelineSource} backed by `pn-Timelines` (one paginated query per
 * check, projection limited to id, category and timestamp).
 */
export class DynamoTimelineSource implements TimelineSource {
  constructor(private readonly service: SENDTimelineService) {}

  public async query(iun: string): Promise<ReadonlyArray<SENDTimelineElement>> {
    return this.service.queryTimelineElements(iun);
  }
}
