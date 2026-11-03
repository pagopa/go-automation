import type { SENDTimelineElement } from '../../services/timeline/models/SENDTimelineElement.js';
import type { RequestIdSelection } from './RequestIdSelection.js';
import type { RequestIdSelectionOptions } from './RequestIdSelectionOptions.js';

/**
 * Selects the `requestId` of a notification from its timeline (§8.3). Pure.
 *
 * Same rule as the `jq` used so far: elements ordered by `timestamp` (ties by
 * `timelineElementId`), for each category the **first** element whose
 * `category` is **equal** to it, `timelineElementId` returned as is.
 *
 * @param elements - Timeline elements, in any order
 * @param options - Categories, column rule, wait rule, end categories
 * @returns Ids per category, column value and completion
 */
export function selectRequestIds(
  elements: ReadonlyArray<SENDTimelineElement>,
  options: RequestIdSelectionOptions,
): RequestIdSelection {
  const wanted = new Set(options.categories);
  const ends = new Set(options.endCategories);
  const firstByCategory = new Map<string, string>();
  let endedBy: string | undefined;

  const ordered = [...elements].sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp) || a.timelineElementId.localeCompare(b.timelineElementId),
  );
  for (const element of ordered) {
    if (wanted.has(element.category) && !firstByCategory.has(element.category)) {
      firstByCategory.set(element.category, element.timelineElementId);
    }
    if (endedBy === undefined && ends.has(element.category)) endedBy = element.category;
  }

  const requestIds = new Map<string, string>();
  for (const category of options.categories) {
    const id = firstByCategory.get(category);
    if (id !== undefined) requestIds.set(category, id);
  }

  const ids = [...requestIds.values()];
  const requestId = options.select === 'priority' ? ids[0] : ids.length > 0 ? ids.join('|') : undefined;
  const complete = options.wait === 'any' ? requestIds.size > 0 : requestIds.size === options.categories.length;
  return {
    requestIds,
    complete,
    ...(requestId !== undefined && { requestId }),
    ...(endedBy !== undefined && { endedBy }),
  };
}
