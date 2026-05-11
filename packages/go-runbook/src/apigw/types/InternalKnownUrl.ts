import type { KnownUrlMatchType } from './KnownUrlMatchType.js';

/**
 * Known URL pointing to a microservice that is part of the runbook scope.
 *
 * The `service` field is mandatory and must reference a microservice
 * declared in the runbook's `services` array. The registry exposes a
 * consistency check (see {@link KnownUrlsRegistry.getInternalServices}) so
 * that drift between the URL registry and the analyzed-services list can
 * be surfaced through the `<prefix>UrlNeedsRoutingFix` context variable.
 */
export interface InternalKnownUrl {
  readonly kind: 'internal';
  /** URL or pattern used for matching */
  readonly url: string;
  /** Strategy used to compare {@link url} with the observed URL. Default: `prefix` */
  readonly matchType?: KnownUrlMatchType;
  /** Microservice name that owns this URL */
  readonly service: string;
  /** Forbidden — present only to enable exhaustiveness checks on the union */
  readonly downstream?: never;
  /** Free-form description used for trace and diagnostics */
  readonly description?: string;
}
