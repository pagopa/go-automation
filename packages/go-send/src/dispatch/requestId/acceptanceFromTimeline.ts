import type { SENDTimelineElement } from '../../services/timeline/models/SENDTimelineElement.js';
import type { TimelineAcceptance } from '../model/TimelineAcceptance.js';

/** Category SEND writes when it refuses the notification. */
const REFUSAL_CATEGORY = 'REQUEST_REFUSED';

/**
 * Categories SEND writes only after accepting the notification: the
 * acceptance itself, the delivery preparations and the ends of a delivery
 * workflow. Fixed by SEND, independent of the categories the run selects.
 */
const ACCEPTANCE_CATEGORIES: ReadonlySet<string> = new Set([
  'REQUEST_ACCEPTED',
  'PREPARE_ANALOG_DOMICILE',
  'PREPARE_DIGITAL_DOMICILE',
  'DIGITAL_SUCCESS_WORKFLOW',
  'DIGITAL_FAILURE_WORKFLOW',
  'ANALOG_SUCCESS_WORKFLOW',
  'ANALOG_FAILURE_WORKFLOW',
  'COMPLETELY_UNREACHABLE',
  'NOTIFICATION_CANCELLED',
]);

/**
 * Reads SEND's acceptance of a notification from its timeline. Pure.
 *
 * The evidence comes from categories fixed by SEND, never from the
 * categories the run selects (`--request-id-categories`) or treats as ends
 * (`--request-id-end-categories`): a selected category found in the
 * timeline says nothing about the acceptance. `REQUEST_REFUSED` wins over
 * any other element.
 * Complexity: O(N) where N is the number of timeline elements.
 *
 * @param elements - Timeline elements, in any order
 * @returns `ACCEPTED`, `REFUSED`, or `undefined` when the timeline shows neither
 *
 * @example
 * ```typescript
 * acceptanceFromTimeline([{ category: 'REQUEST_ACCEPTED', timelineElementId: 'R', timestamp: 't' }]); // 'ACCEPTED'
 * ```
 */
export function acceptanceFromTimeline(elements: ReadonlyArray<SENDTimelineElement>): TimelineAcceptance | undefined {
  let accepted = false;
  for (const element of elements) {
    if (element.category === REFUSAL_CATEGORY) return 'REFUSED';
    if (ACCEPTANCE_CATEGORIES.has(element.category)) accepted = true;
  }
  return accepted ? 'ACCEPTED' : undefined;
}
