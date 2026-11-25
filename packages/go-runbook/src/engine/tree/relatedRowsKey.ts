/** Which related rows of a step a node holds besides its own error rows. */
export type RelatedRows = 'context' | 'siblings';

/**
 * The key, in the step results of a node context, of the related rows of a step: `steps.<id>.context` and
 * `steps.<id>.siblings` resolve to it.
 *
 * @param stepId - Step whose rows are related
 * @param related - Which related rows
 * @returns The key
 *
 * @example
 * ```typescript
 * relatedRowsKey('query-pn-delivery', 'context'); // 'query-pn-delivery#context'
 * ```
 */
export function relatedRowsKey(stepId: string, related: RelatedRows): string {
  return `${stepId}#${related}`;
}
