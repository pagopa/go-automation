/**
 * Structural equality for two DynamoDB items in wire form.
 *
 * Attribute order is not significant: DynamoDB returns attributes in its own
 * order, which does not match the order a file happens to list them in — the
 * live `pn-EcAnagrafica` starts with `sqsArn` where the repository file starts
 * with `sqsName`. Comparing serialised text would call every item different.
 */

/** Whether a value is a plain object worth descending into. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Compares two wire-form values.
 *
 * @param left - One side
 * @param right - The other side
 * @returns Whether they are structurally equal
 */
export function deepEqualWire(left: unknown, right: unknown): boolean {
  if (left === right) return true;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((entry, index) => deepEqualWire(entry, right[index]));
  }

  if (!isRecord(left) || !isRecord(right)) return false;

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key, index) => rightKeys[index] === key && deepEqualWire(left[key], right[key]));
}
