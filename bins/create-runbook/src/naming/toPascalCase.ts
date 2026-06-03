/**
 * Converts a kebab/snake/space separated identifier to UpperCamelCase.
 *
 * Consecutive separators collapse to one and each segment keeps its tail
 * capitalization (so `B2B` stays `B2B`, `ApiGwAlarm` stays `ApiGwAlarm`).
 *
 * @param value - Separated identifier (e.g. `delivery-B2B-ApiGwAlarm`)
 * @returns The UpperCamelCase form (e.g. `DeliveryB2BApiGwAlarm`)
 */
export function toPascalCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}
