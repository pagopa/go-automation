/**
 * Classification of a known URL with respect to the runbook scope.
 *
 * - `internal`: the URL maps to a microservice covered by the runbook.
 *   The associated `service` name MUST appear in the runbook's `services`
 *   array (see {@link KnownUrlsRegistry} consistency rules).
 * - `external`: the URL maps to an external downstream (e.g. AppIO, PDV).
 *   The associated `downstream` name is informational metadata.
 */
export type KnownUrlKind = 'internal' | 'external';
