import type { KnownUrlMatchType } from './KnownUrlMatchType.js';

/**
 * Known URL declared by an API Gateway alarm runbook.
 *
 * Each entry maps a URL (or pattern) to a `target` name. The semantics
 * of `target` are resolved at runtime by the decision step:
 *
 * - if `target` matches one of the microservices declared in the runbook
 *   (`entryService` + `services`), the analysis loops into that service;
 * - otherwise `target` is treated as an external downstream (e.g. AppIO,
 *   PDV, Selfcare) and the analysis terminates with a "downstream"
 *   diagnostic.
 *
 * No `kind` discriminator is needed: the internal/external classification
 * is a property of the runbook configuration, not of the URL itself.
 *
 * @example
 * ```typescript
 * const internal: KnownUrl = {
 *   url: 'http://internal-EcsA-.../ext-registry-private/io/v1/activations',
 *   matchType: 'prefix',
 *   target: 'pn-external-registries',
 *   description: 'Load balancer interno verso ext-registry-private',
 * };
 *
 * const external: KnownUrl = {
 *   url: 'https://api.io.pagopa.it/api/v1/activations/',
 *   matchType: 'prefix',
 *   target: 'AppIO',
 * };
 * ```
 */
export interface KnownUrl {
  /** URL or pattern used for matching */
  readonly url: string;
  /** Strategy used to compare {@link url} with the observed URL. Default: `prefix` */
  readonly matchType?: KnownUrlMatchType;
  /**
   * Name of the target reached by this URL. May be an internal
   * microservice name (then the analysis continues there) or an external
   * downstream (then the analysis terminates).
   */
  readonly target: string;
  /** Free-form description used for trace and diagnostics */
  readonly description?: string;
}
