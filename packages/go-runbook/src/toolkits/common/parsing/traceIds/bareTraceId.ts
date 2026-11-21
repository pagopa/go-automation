/** A compact trace id: 32 hex digits, without the `1-` prefix and the dash. */
const COMPACT_TRACE_ID_PATTERN = /^[0-9a-fA-F]{32}$/;

/** An X-Ray trace id: `1-`, 8 hex digits, a dash and 24 hex digits. */
const XRAY_TRACE_ID_PATTERN = /^1-[0-9a-fA-F]{8}-[0-9a-fA-F]{24}$/;

/**
 * The canonical form of a direct trace id: an X-Ray or a compact id, in any case, in lowercase X-Ray form.
 *
 * @param input - Candidate trace id, without other fields around it
 * @returns The canonical trace id, or `undefined` when the value is not a direct trace id
 *
 * @example
 * ```typescript
 * bareTraceId('6789ABCD0123456789abcdef01234567'); // '1-6789abcd-0123456789abcdef01234567'
 * ```
 */
export function bareTraceId(input: string): string | undefined {
  if (XRAY_TRACE_ID_PATTERN.test(input)) return input.toLowerCase();
  if (COMPACT_TRACE_ID_PATTERN.test(input)) return `1-${input.slice(0, 8)}-${input.slice(8)}`.toLowerCase();
  return undefined;
}
