/**
 * Collects an async iterable into an array (tests only: production code
 * consumes journals as streams).
 *
 * @param items - Items to collect
 * @returns The items, in order
 */
export async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const item of items) collected.push(item);
  return collected;
}
