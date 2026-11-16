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
