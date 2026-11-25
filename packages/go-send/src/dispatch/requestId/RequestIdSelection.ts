/**
 * Outcome of `selectRequestIds` on one timeline.
 */
export interface RequestIdSelection {
  /** First `timelineElementId` of each category found, in category order. */
  readonly requestIds: ReadonlyMap<string, string>;
  /** Value of the `requestId` column, when at least one category was found. */
  readonly requestId?: string;
  /** Whether the row can be concluded according to the `wait` rule. */
  readonly complete: boolean;
  /** First end-of-workflow category in the timeline, if any. */
  readonly endedBy?: string;
}
