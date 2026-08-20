/**
 * Parsing of the selection scope: which products, and for each product which
 * environments, the interactive selection is allowed to offer.
 */
import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import type { ScopeTarget } from '../types/ScopeTarget.js';

/** Separator between the product id and its environment list in the compact form. */
const PRODUCT_ENVIRONMENTS_SEPARATOR = ':';
/**
 * Separators between environment ids in the compact form.
 *
 * `|` is the CLI-safe one: the config layer already splits array flags on `,`,
 * so a comma only survives when the value comes from a file, where it is still
 * accepted.
 */
const ENVIRONMENTS_SEPARATOR = /[|,]/u;

/**
 * Parses the configured scope into one entry per product.
 *
 * Each `targets` entry is either a JSON object (the shape produced by
 * `config.json`, where nested objects are serialized by the config layer) or the
 * compact form `productId:envId1|envId2`. Entries repeating the same product are
 * merged, and a product declared once without environments keeps every
 * environment (an explicit list elsewhere does not narrow it).
 *
 * Only `productId` and `environmentIds` are accepted in the JSON form: a
 * misspelled key is rejected instead of being ignored, because ignoring it would
 * silently turn a restricted scope into an unrestricted one.
 *
 * Complexity: O(N) in the number of declared product/environment pairs.
 *
 * @param config - Validated script configuration
 * @returns One scope entry per product, in declaration order (empty = no restriction)
 * @throws Error when an entry is malformed or declares no product id
 *
 * @example
 * ```typescript
 * parseScopeTargets({ targets: ['{"productId":"p1","environmentIds":["e1"]}', 'p2:e2|e3'] });
 * // [{ productId: 'p1', environmentIds: ['e1'] }, { productId: 'p2', environmentIds: ['e2', 'e3'] }]
 * ```
 */
export function parseScopeTargets(config: GoRtaCheckConfig): ReadonlyArray<ScopeTarget> {
  const entries = (config.targets ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (entries.length === 0) return [];

  const order: string[] = [];
  const environmentsByProduct = new Map<string, Set<string> | undefined>();

  for (const [index, entry] of entries.entries()) {
    const target = parseScopeTarget(entry, index);
    if (!environmentsByProduct.has(target.productId)) {
      order.push(target.productId);
      environmentsByProduct.set(target.productId, target.environmentIds.length === 0 ? undefined : new Set());
    }
    const merged = environmentsByProduct.get(target.productId);
    // `undefined` means "every environment": an explicit list never narrows it.
    if (merged === undefined || target.environmentIds.length === 0) {
      environmentsByProduct.set(target.productId, undefined);
      continue;
    }
    for (const environmentId of target.environmentIds) merged.add(environmentId);
  }

  return order.map((productId) => ({
    productId,
    environmentIds: [...(environmentsByProduct.get(productId) ?? [])],
  }));
}

/**
 * Returns the environments allowed for a product, or `undefined` when the scope
 * puts no restriction on it (product absent from the scope, or declared without
 * environments).
 *
 * @param scope - The parsed scope
 * @param productId - The product to look up
 * @returns The allowed environment ids, or `undefined` when unrestricted
 */
export function scopedEnvironmentIds(
  scope: ReadonlyArray<ScopeTarget>,
  productId: string,
): ReadonlyArray<string> | undefined {
  const target = scope.find((entry) => entry.productId === productId);
  if (target === undefined || target.environmentIds.length === 0) return undefined;
  return target.environmentIds;
}

function parseScopeTarget(entry: string, index: number): ScopeTarget {
  const raw = entry.startsWith('{') ? parseJsonTarget(entry, index) : parseCompactTarget(entry);
  const productId = toTrimmedString(raw.productId);
  if (productId === undefined) {
    throw new Error(`Invalid targets[${String(index)}]: productId is required. Entry: ${entry}`);
  }
  return { productId, environmentIds: toEnvironmentIds(raw.environmentIds, entry, index) };
}

interface RawScopeTarget {
  readonly productId: unknown;
  readonly environmentIds: unknown;
}

function parseJsonTarget(entry: string, index: number): RawScopeTarget {
  let parsed: unknown;
  try {
    parsed = JSON.parse(entry) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON targets[${String(index)}]: ${entry}`, { cause: error });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid JSON targets[${String(index)}]: expected an object. Entry: ${entry}`);
  }
  const record = parsed as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== 'productId' && key !== 'environmentIds') {
      throw new Error(
        `Invalid targets[${String(index)}]: unknown key "${key}" ` +
          `(expected "productId" and "environmentIds"). Entry: ${entry}`,
      );
    }
  }
  return { productId: record['productId'], environmentIds: record['environmentIds'] };
}

function parseCompactTarget(entry: string): RawScopeTarget {
  const separatorAt = entry.indexOf(PRODUCT_ENVIRONMENTS_SEPARATOR);
  if (separatorAt < 0) return { productId: entry, environmentIds: [] };
  return {
    productId: entry.slice(0, separatorAt),
    environmentIds: entry.slice(separatorAt + 1).split(ENVIRONMENTS_SEPARATOR),
  };
}

function toEnvironmentIds(value: unknown, entry: string, index: number): ReadonlyArray<string> {
  if (value === undefined || value === null) return [];
  const items = Array.isArray(value) ? value : [value];
  const environmentIds: string[] = [];
  for (const item of items) {
    const environmentId = toTrimmedString(item);
    if (environmentId === undefined) {
      throw new Error(`Invalid targets[${String(index)}]: environmentIds must be non-empty strings. Entry: ${entry}`);
    }
    if (!environmentIds.includes(environmentId)) environmentIds.push(environmentId);
  }
  return environmentIds;
}

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}
