import type { ResultField } from '@go-automation/go-common/aws';
import type { ServiceLogSchema } from '../profiles/schemas/ServiceLogSchema.js';
import type { KnownUrlsRegistry } from '../registries/KnownUrlsRegistry.js';
import type { KnownUrl } from '../types/KnownUrl.js';
import { scanServiceLogs } from './scanServiceLogs.js';

/**
 * Outcome of {@link findKnownUrlInLogs} when the scan yields a match.
 */
export interface KnownUrlInLogs {
  /** URL exactly as observed in the log message (already trimmed). */
  readonly observedUrl: string;
  /** Registry entry that matched the observed URL. */
  readonly known: KnownUrl;
}

/**
 * Scans CloudWatch Logs result rows for the first URL that matches an
 * entry in the supplied {@link KnownUrlsRegistry}.
 *
 * Rows are scanned in order; for each row every `http(s)://` token is
 * extracted, trimmed of trailing punctuation and probed against the
 * registry. The first match wins.
 *
 * @param results - CloudWatch Logs Insights result rows
 * @param registry - Registry of known URLs
 * @param schema - schema dei log applicativi (per il campo message)
 * @returns The first known URL found, or `undefined`
 */
export function findKnownUrlInLogs(
  results: ReadonlyArray<ResultField[]>,
  registry: KnownUrlsRegistry,
  schema: ServiceLogSchema,
): KnownUrlInLogs | undefined {
  return scanServiceLogs(results, schema, registry).knownUrl;
}
