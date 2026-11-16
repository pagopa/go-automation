/**
 * Log field that carries the `[DOWNSTREAM] Service … returned errors=` marker:
 * the raw event (`@message`) or the structured `message` (EVO-RBREORG-OPUS-01 R4).
 */
export type DownstreamMarkerField = '@message' | 'message';
