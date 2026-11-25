/**
 * Fingerprint of an API key safe to display: its last 4 characters.
 *
 * @param apiKey - The secret
 * @returns E.g. `…a1b2`
 */
export function apiKeyFingerprint(apiKey: string): string {
  return apiKey.length <= 8 ? '…' : `…${apiKey.slice(-4)}`;
}
