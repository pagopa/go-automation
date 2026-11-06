import type { SENDTimelineElement } from './models/SENDTimelineElement.js';

/** Fractional seconds of an ISO 8601 timestamp (any precision). */
const FRACTION_PATTERN = /\.(\d+)/;

/** Digits of the normalized fraction: nanoseconds. */
const FRACTION_DIGITS = 9;

/** A timeline element with its precomputed sort key. */
interface SortableTimelineElement {
  readonly element: SENDTimelineElement;
  readonly epochMs: number;
  readonly fraction: string;
}

/**
 * Sorts timeline elements chronologically, then by id. Timestamps are
 * compared as instants, not as strings (`…:30.5Z` is after `…:30Z`), with
 * sub-millisecond digits as a tie-break; unparsable timestamps go last.
 * Keys are computed once per element: O(N log N).
 *
 * `pn-Timelines` timestamps have variable precision (Java `Instant.toString()`
 * drops trailing zeros), so a string comparison would misorder them.
 *
 * @param elements - Elements to sort
 * @returns A new sorted array
 */
export function sortTimelineElements(elements: ReadonlyArray<SENDTimelineElement>): SENDTimelineElement[] {
  const sortable: SortableTimelineElement[] = elements.map((element) => {
    const parsed = Date.parse(element.timestamp);
    return {
      element,
      epochMs: Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed,
      fraction: (FRACTION_PATTERN.exec(element.timestamp)?.[1] ?? '').padEnd(FRACTION_DIGITS, '0'),
    };
  });
  sortable.sort((a, b) => {
    if (a.epochMs !== b.epochMs) return a.epochMs < b.epochMs ? -1 : 1;
    return (
      a.fraction.localeCompare(b.fraction) ||
      a.element.timestamp.localeCompare(b.element.timestamp) ||
      a.element.timelineElementId.localeCompare(b.element.timelineElementId)
    );
  });
  return sortable.map((item) => item.element);
}
