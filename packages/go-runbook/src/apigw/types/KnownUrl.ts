import type { InternalKnownUrl } from './InternalKnownUrl.js';
import type { ExternalKnownUrl } from './ExternalKnownUrl.js';

/**
 * Discriminated union covering the two possible known URL kinds.
 *
 * Use the `kind` field to refine the type at compile time:
 *
 * @example
 * ```typescript
 * function describe(u: KnownUrl): string {
 *   return u.kind === 'internal'
 *     ? `internal → ${u.service}`
 *     : `external → ${u.downstream}`;
 * }
 * ```
 */
export type KnownUrl = InternalKnownUrl | ExternalKnownUrl;
