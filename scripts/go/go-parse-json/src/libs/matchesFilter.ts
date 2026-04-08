/**
 * Simple key=value filter matcher for JSON objects.
 */

import { Core } from '@go-automation/go-common';

/**
 * Checks if an object matches a simple key=value filter string.
 *
 * @param item - The object to check
 * @param filter - Filter string in "key=value" format, or undefined to skip
 * @returns True if the item matches (or no filter is provided)
 */
export function matchesFilter(item: unknown, filter: string | undefined): boolean {
  if (!filter) return true;
  const [key, expectedValue] = filter.split('=');
  if (!key || expectedValue === undefined) return true;

  const extractor = new Core.GOJSONFieldExtractor({ parseEmbeddedJson: true });
  const actualValue = extractor.extract(item, key.trim());
  return String(actualValue) === expectedValue.trim();
}
