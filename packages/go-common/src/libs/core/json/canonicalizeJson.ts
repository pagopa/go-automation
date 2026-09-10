/**
 * Canonical JSON: recursively sorted object keys, compact UTF-8 JSON, array
 * order preserved.
 *
 * Deterministic by construction, so the same value always yields the same
 * string and can be hashed into a stable digest. Keys are ordered by Unicode
 * code point rather than by `Array.prototype.sort`'s UTF-16 order, so
 * astral-plane keys sort the same way on every platform.
 *
 * @param value - Any JSON-representable value
 * @returns The canonical serialization
 * @throws Error when the value contains a non-finite number, which JSON cannot
 *         represent and which would otherwise serialize as `null`
 *
 * @example
 * ```typescript
 * canonicalizeJson({ b: 1, a: [2, 1] }); // '{"a":[2,1],"b":1}'
 * ```
 */
export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (typeof value !== 'object' || value === null) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Canonical JSON rejects non-finite numbers');
    }
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
      .map(([key, nested]) => [key, sortJsonValue(nested)]),
  );
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const leftCodePoints = Array.from(left);
  const rightCodePoints = Array.from(right);
  const length = Math.min(leftCodePoints.length, rightCodePoints.length);
  for (let index = 0; index < length; index += 1) {
    const leftCodePoint = leftCodePoints[index]?.codePointAt(0) ?? 0;
    const rightCodePoint = rightCodePoints[index]?.codePointAt(0) ?? 0;
    if (leftCodePoint < rightCodePoint) return -1;
    if (leftCodePoint > rightCodePoint) return 1;
  }
  return leftCodePoints.length - rightCodePoints.length;
}
