/**
 * Suggests a `varPrefix` for an API Gateway entry service, in lowerCamelCase.
 *
 * The leading `pn-` (if present) is dropped; the remaining segments are
 * joined in camelCase (e.g. `pn-user-attributes` → `userAttributes`,
 * `pn-delivery` → `delivery`, `pn-data-vault` → `dataVault`).
 *
 * @param serviceName - Microservice name (e.g. `pn-data-vault`)
 * @returns Suggested varPrefix (e.g. `dataVault`)
 */
export function deriveVarPrefix(serviceName: string): string {
  const segments = serviceName
    .replace(/^pn-/, '')
    .split(/[-_\s]+/)
    .filter((segment) => segment.length > 0);

  const [first, ...rest] = segments;
  if (first === undefined) {
    return '';
  }

  const tail = rest.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1)).join('');
  return `${first.toLowerCase()}${tail}`;
}
