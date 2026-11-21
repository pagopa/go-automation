/** Longest identifier kept in the correlation of a node. */
const MAX_CORRELATION_LENGTH = 128;

/** Characters of an identifier: request ids, trace ids, UUIDs, X-Ray headers. */
const CORRELATION_VALUE = /^[\w.:;=/-]+$/u;

/**
 * An identifier as the correlation of an error node may show it: trimmed, bounded and made only of the characters
 * of an identifier. Anything else (free text, a value over the bound) is left out.
 *
 * @param value - Identifier read from a log
 * @returns The identifier, or nothing when it is not a safe one
 *
 * @example
 * ```typescript
 * safeCorrelationValue(' 1-6789abcd-0123456789abcdef01234567 '); // '1-6789abcd-0123456789abcdef01234567'
 * safeCorrelationValue('not an id'); // undefined
 * ```
 */
export function safeCorrelationValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '' || trimmed.length > MAX_CORRELATION_LENGTH || !CORRELATION_VALUE.test(trimmed)) return undefined;
  return trimmed;
}
