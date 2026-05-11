import type { KnownUrlMatchType } from './KnownUrlMatchType.js';

/**
 * Known URL pointing to an external downstream that is out of the runbook
 * scope (e.g. AppIO, PDV, Selfcare). Matching such a URL terminates the
 * analysis chain for the current trace.
 */
export interface ExternalKnownUrl {
  readonly kind: 'external';
  /** URL or pattern used for matching */
  readonly url: string;
  /** Strategy used to compare {@link url} with the observed URL. Default: `prefix` */
  readonly matchType?: KnownUrlMatchType;
  /** Logical name of the external downstream (e.g. `AppIO`, `PDV`) */
  readonly downstream: string;
  /** Forbidden — present only to enable exhaustiveness checks on the union */
  readonly service?: never;
  /** Free-form description used for trace and diagnostics */
  readonly description?: string;
}
