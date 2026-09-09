/** Any run of characters a TypeScript identifier cannot contain. */
const NON_IDENTIFIER = /[^A-Za-z0-9]+/gu;

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
 * The result is always a valid identifier, because the generated
 * `registration.ts` would otherwise not parse. A runbook id accepts `.` and may
 * start with a digit (see `runbookIdError`), so `interop-selfcare-1.0-apigw-5xx`
 * and `5xx-gateway-errors` both need normalising: every non-alphanumeric run
 * becomes a single `_`, and a digit-leading name is prefixed with `RUNBOOK_`.
 *
 * @param runbookId - Runbook id / directory name (e.g. `pn-delivery-B2B-ApiGwAlarm`)
 * @returns Suggested constant name (e.g. `DELIVERY_B2B_API_GW_ALARM_REGISTRATION`)
 *
 * @example
 * ```typescript
 * deriveRegistrationName('pn-delivery-B2B-ApiGwAlarm');
 * // 'DELIVERY_B2B_API_GW_ALARM_REGISTRATION'
 *
 * deriveRegistrationName('interop-selfcare-1.0-apigw-5xx');
 * // 'INTEROP_SELFCARE_1_0_APIGW_5XX_REGISTRATION'
 * ```
 */
export function deriveRegistrationName(runbookId: string): string {
  const constantCase = runbookId
    .replace(/^pn-/u, '')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1_$2')
    .replace(/([a-z])([A-Z])/gu, '$1_$2')
    .replace(NON_IDENTIFIER, '_')
    .replace(/^_+|_+$/gu, '')
    .toUpperCase();

  const identifier = /^[0-9]/u.test(constantCase) ? `RUNBOOK_${constantCase}` : constantCase;

  return `${identifier}_REGISTRATION`;
}
