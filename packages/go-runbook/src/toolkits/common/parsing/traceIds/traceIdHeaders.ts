/** `Root=` segment of an X-Ray trace header (`Root=1-…;Parent=…;Sampled=1`). */
const XRAY_HEADER_ROOT_PATTERN = /(?:^|;)Root=(1-[0-9a-fA-F]{8}-[0-9a-fA-F]{24})(?:;|$)/;

/**
 * Canonical trace id carried by an X-Ray trace header.
 *
 * @param header - Raw header value
 * @returns The `Root` trace id, or `undefined` when the value is not such a header
 */
export function readXrayHeaderRoot(header: string): string | undefined {
  return XRAY_HEADER_ROOT_PATTERN.exec(header)?.[1];
}

/** A W3C `traceparent` header: version, 32-hex trace id, 16-hex parent id, flags. */
const TRACEPARENT = /^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/iu;

/**
 * The trace id carried by a W3C `traceparent` header.
 *
 * @param header - Raw header value, without spaces around it
 * @returns The 32-hex trace id, or `undefined` when the value is not such a header
 *
 * @example
 * ```typescript
 * readTraceparentTraceId('00-6789abcd0123456789abcdef01234567-0123456789abcdef-01'); // '6789abcd0123456789abcdef01234567'
 * ```
 */
export function readTraceparentTraceId(header: string): string | undefined {
  return TRACEPARENT.exec(header)?.[1];
}
