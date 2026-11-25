import type { EvidenceTime } from './EvidenceTime.js';

/**
 * Reads the time of an evidence element, so that the engine never knows the shape of a log row.
 *
 * @returns The element's time, or `undefined` when the element has none
 */
export type EvidenceTimeReaderFn = (element: unknown) => EvidenceTime | undefined;
