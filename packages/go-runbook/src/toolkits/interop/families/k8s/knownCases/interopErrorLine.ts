/**
 * A pattern that recognizes the signatures only as the message of an error line (`ERROR - <signature>`): the same
 * text inside another error, such as the cause of a crash, does not match.
 *
 * @param signatures - Signatures, as regular expressions, any of which the line may carry
 * @returns The regular expression of the error line
 *
 * @example
 * ```typescript
 * interopErrorLine(INTEROP_KAFKA_SIGNATURES.connectionRefused);
 * // 'ERROR\\s*-\\s*(?:Connection\\s+error:\\s*connect ECONNREFUSED\\b)'
 * ```
 */
export function interopErrorLine(...signatures: ReadonlyArray<string>): string {
  return `ERROR\\s*-\\s*(?:${signatures.join('|')})`;
}
