/**
 * Log field that carries the `[DOWNSTREAM] Service … returned errors=` marker:
 * the raw event (`@message`) or the structured `message`.
 */
export type DownstreamMarkerField = '@message' | 'message';
