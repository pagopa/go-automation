/**
 * Drains an async iterable into an array.
 *
 * @param items - The async iterable to consume
 * @returns Every yielded item, in order
 */
export async function collectAsync<T>(items: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of items) result.push(item);
  return result;
}
