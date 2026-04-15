/**
 * SEND Timeline Element - Single timeline entry from DynamoDB
 */

/**
 * Represents a single element in a notification timeline
 *
 * @example
 * ```typescript
 * const element: SENDTimelineElement = {
 *   timelineElementId: 'REQUEST_ACCEPTED.IUN_ABCD',
 *   category: 'REQUEST_ACCEPTED',
 *   timestamp: '2024-01-15T10:30:00.000Z',
 * };
 * ```
 */
export interface SENDTimelineElement {
  /** Unique identifier for the timeline element */
  readonly timelineElementId: string;

  /** Category of the timeline event */
  readonly category: string;

  /** Timestamp when the event occurred (ISO 8601 format) */
  readonly timestamp: string;
}
