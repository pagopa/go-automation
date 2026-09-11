/** Canonical JSON: recursively sorted object keys, compact UTF-8 JSON, array order preserved. */
export function canonicalizeJson(value: unknown): string {
  // `JSON.stringify` returns `undefined` for a value it cannot represent at the
  // top level; the lib typing has always described that as `string`.
  return serializeJsonValue(value) as string;
}

/**
 * Writes the JSON text directly instead of sorting a copy of the value and
 * handing it to `JSON.stringify`.
 *
 * Building a sorted object first does not work: an object emits its
 * integer-like keys in ascending numeric order before every other key,
 * whatever order they were inserted in. `{ '10': 1, '2': 2 }` would come back
 * as `{"2":2,"10":1}`, and a key such as `'-1'` or `'01'`, which is not an
 * index, would be pushed after the ones that are. Emitting the text here keeps
 * the sort below as the only thing that decides order.
 *
 * Returns `undefined` for a value JSON cannot represent, which the callers
 * above translate the way `JSON.stringify` does: omitted from an object,
 * written as `null` in an array.
 */
function serializeJsonValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeJsonValue(item) ?? 'null').join(',')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    const members = Object.keys(value)
      .sort(compareUnicodeCodePoints)
      .flatMap((key) => {
        const serialized = serializeJsonValue((value as Record<string, unknown>)[key]);
        return serialized === undefined ? [] : [`${JSON.stringify(key)}:${serialized}`];
      });

    return `{${members.join(',')}}`;
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('Canonical JSON rejects non-finite numbers');
  }

  return JSON.stringify(value);
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
