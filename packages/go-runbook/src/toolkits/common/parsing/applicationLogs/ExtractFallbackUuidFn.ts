/**
 * Extracts a product correlation id from an application log message (SEND:
 * the `FALLBACK-UUID:<uuid>` token). Product toolkits inject it; the generic
 * scanners extract nothing without one.
 */
export type ExtractFallbackUuidFn = (message: string) => string | undefined;
