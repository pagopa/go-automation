/**
 * Builds the key that identifies one item, from its DynamoDB wire form.
 *
 * The reference reads `item[key].S` on both sides. That assumes every key
 * attribute is a String, and it has two failure modes that are worse than an
 * error: a key attribute of another type reads `undefined` on both sides, and
 * `undefined == undefined` is true, so every item matches the first candidate;
 * a missing attribute throws halfway through a run. Every key of all seventeen
 * tables is a String today, so neither is live — which is exactly why it is
 * worth fixing now rather than after it changes.
 *
 * Here any scalar type is accepted and the type is kept in the key, so a
 * string `"1"` and a number `1` cannot collide.
 */

/** Scalar attribute types a key may use; DynamoDB allows no others. */
const SCALAR_TYPES: ReadonlyArray<string> = ['S', 'N', 'B'];

/** Separator between the parts of a composite key. */
const KEY_SEPARATOR = '\u0000';

/**
 * Reads one key attribute as `type:value`.
 *
 * @param item - The item, in wire form
 * @param attribute - Key attribute name
 * @returns The typed value
 * @throws Error when the attribute is absent or not a scalar
 */
function readKeyAttribute(item: Record<string, unknown>, attribute: string): string {
  const value = item[attribute];
  if (value === undefined || value === null || typeof value !== 'object') {
    throw new Error(`item carries no key attribute '${attribute}'`);
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const scalar = entries.find(([type]) => SCALAR_TYPES.includes(type));
  if (scalar === undefined) {
    const found = entries.map(([type]) => type).join(', ') || 'nothing';
    throw new Error(`key attribute '${attribute}' is ${found}, which cannot be a DynamoDB key`);
  }

  return `${scalar[0]}:${String(scalar[1])}`;
}

/**
 * Builds the identity of an item from the table's key schema.
 *
 * @param item - The item, in wire form
 * @param keys - Key attributes, in key-schema order
 * @returns A key that is equal exactly when the items are the same item
 * @throws Error naming the attribute that made the item unidentifiable
 */
export function itemKey(item: Record<string, unknown>, keys: ReadonlyArray<string>): string {
  return keys.map((attribute) => readKeyAttribute(item, attribute)).join(KEY_SEPARATOR);
}

/**
 * Renders a key for a human, without the separator.
 *
 * @param key - A key built by {@link itemKey}
 * @returns The same key, readable
 */
export function displayKey(key: string): string {
  return key
    .split(KEY_SEPARATOR)
    .map((part) => part.slice(part.indexOf(':') + 1))
    .join(' / ');
}
