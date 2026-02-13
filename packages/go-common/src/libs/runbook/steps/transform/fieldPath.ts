/**
 * Parses a field path string into an array of segment keys.
 * Supports dot notation and bracket array indices.
 *
 * @param path - The field path string (e.g. '[0].status', 'data.items[2].name')
 * @returns An array of string segments representing each navigation step
 *
 * @example
 * ```typescript
 * parseFieldPath('[0].status');        // ['0', 'status']
 * parseFieldPath('data.items[2].name'); // ['data', 'items', '2', 'name']
 * parseFieldPath('simple');             // ['simple']
 * ```
 */
export function parseFieldPath(path: string): ReadonlyArray<string> {
  const segments: string[] = [];
  const regex = /\[(\d+)\]|([^.[]+)/g;
  let match = regex.exec(path);

  while (match !== null) {
    // match[1] is the array index, match[2] is the property name
    const segment = match[1] ?? match[2];
    if (segment !== undefined) {
      segments.push(segment);
    }
    match = regex.exec(path);
  }

  return segments;
}

/**
 * Navigates an object graph using a dot/bracket field path and returns the value at that path.
 * Returns undefined if any segment along the path is not found.
 *
 * @param source - The root object to navigate
 * @param path - The field path string (e.g. '[0].status', 'data.items[2].name')
 * @returns The value at the specified path, or undefined if not reachable
 *
 * @example
 * ```typescript
 * const data = [{ status: 'OK' }, { status: 'ERROR' }];
 * navigateFieldPath(data, '[0].status');  // 'OK'
 * navigateFieldPath(data, '[5].status');  // undefined
 * ```
 */
export function navigateFieldPath(source: unknown, path: string): unknown {
  const segments = parseFieldPath(path);
  let current: unknown = source;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    // Safe indexed access on the object/array
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}
