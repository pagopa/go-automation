/**
 * Renders a list of tags as a TypeScript array literal.
 *
 * @param tags - Tag values
 * @returns A literal such as `['api-gateway']`, or `[]` when empty
 */
export function formatTagsLiteral(tags: ReadonlyArray<string>): string {
  if (tags.length === 0) {
    return '[]';
  }
  return `[${tags.map((tag) => `'${tag}'`).join(', ')}]`;
}
