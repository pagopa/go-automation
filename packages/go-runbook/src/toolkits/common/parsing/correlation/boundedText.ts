/** Longest raw text an error node copies into its context or a message. */
const MAX_COPIED_TEXT = 4000;

/**
 * A raw text within the bound of what a node copies into its context (`lastErrorMsg`, `<prefix>ErrorMsg`).
 *
 * @param text - Raw text
 * @param max - Longest result
 * @returns The text, cut at the bound
 *
 * @example
 * ```typescript
 * boundedText('x'.repeat(5000)).length; // 4000
 * ```
 */
export function boundedText(text: string, max: number = MAX_COPIED_TEXT): string {
  return text.length <= max ? text : text.slice(0, max);
}
