import { RunbookProducts, type RunbookProduct } from './RunbookProduct.js';

const PRODUCTS: ReadonlySet<unknown> = new Set(Object.values(RunbookProducts));

/**
 * Type guard for {@link RunbookProduct}.
 *
 * @param value - Any value
 * @returns Whether it is a known Watchtower product
 */
export function isRunbookProduct(value: unknown): value is RunbookProduct {
  return PRODUCTS.has(value);
}
