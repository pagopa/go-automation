/**
 * Suggests the name of the exported registration constant for a runbook,
 * following the `<NAME>_REGISTRATION` convention used by the catalog manifest.
 *
 * Derived from the builder name: `build` / `Runbook` are dropped and the rest is
 * converted to CONSTANT_CASE. Like {@link deriveBuilderName} this is a
 * best-effort suggestion — acronyms followed by a digit (`V2Lambda`) stay glued
 * together — so it is fine to shorten it by hand in the generated file.
 *
 * @param builderName - Builder function name (e.g. `buildDeliveryB2BApiGwAlarmRunbook`)
 * @returns Suggested constant name (e.g. `DELIVERY_B2B_API_GW_ALARM_REGISTRATION`)
 *
 * @example
 * ```typescript
 * deriveRegistrationName('buildDeliveryB2BApiGwAlarmRunbook');
 * // 'DELIVERY_B2B_API_GW_ALARM_REGISTRATION'
 * ```
 */
export function deriveRegistrationName(builderName: string): string {
  const core = builderName.replace(/^build/u, '').replace(/Runbook$/u, '');
  const constantCase = core
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1_$2')
    .replace(/([a-z])([A-Z])/gu, '$1_$2')
    .toUpperCase();
  return `${constantCase}_REGISTRATION`;
}
