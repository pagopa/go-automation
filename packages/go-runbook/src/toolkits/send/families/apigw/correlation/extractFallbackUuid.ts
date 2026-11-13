/**
 * Matches the `FALLBACK-UUID:<uuid>` token of the SEND logs (canonical
 * 8-4-4-4-12 hex), anchored on `FALLBACK-UUID:` to avoid catching the X-Ray
 * trace id.
 */
export const FALLBACK_UUID_PATTERN: RegExp =
  /FALLBACK-UUID:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

/**
 * First SEND `FALLBACK-UUID` in a log message.
 *
 * @param message - Application log message
 * @returns The UUID, or `undefined`
 */
export function extractFallbackUuid(message: string): string | undefined {
  return FALLBACK_UUID_PATTERN.exec(message)?.[1];
}
