/**
 * Suggests the name of the exported registration constant for a runbook,
 * following the `<NAME>_REGISTRATION` convention used by the catalog manifest.
 *
 * Derived from the runbook id: the leading `pn-` is dropped and the rest is
 * converted to CONSTANT_CASE. It is a best-effort suggestion — long ids produce
 * long names — so it is fine to shorten it by hand in the generated file. It is
 * the only per-runbook name that must be unique, because `catalogManifest.ts`
 * imports every registration constant into a single scope.
 *
 * @param runbookId - Runbook id / directory name (e.g. `pn-delivery-B2B-ApiGwAlarm`)
 * @returns Suggested constant name (e.g. `DELIVERY_B2B_API_GW_ALARM_REGISTRATION`)
 *
 * @example
 * ```typescript
 * deriveRegistrationName('pn-delivery-B2B-ApiGwAlarm');
 * // 'DELIVERY_B2B_API_GW_ALARM_REGISTRATION'
 * ```
 */
export function deriveRegistrationName(runbookId: string): string {
  const constantCase = runbookId
    .replace(/^pn-/u, '')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1_$2')
    .replace(/([a-z])([A-Z])/gu, '$1_$2')
    .replace(/[-\s]+/gu, '_')
    .toUpperCase();
  return `${constantCase}_REGISTRATION`;
}
