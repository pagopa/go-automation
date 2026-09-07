/**
 * One product of the configured scope, with the environments allowed for it.
 *
 * Environments are product-scoped in Watchtower, so the scope pairs each
 * `productId` with its own environment ids instead of keeping two flat lists.
 * An empty `environmentIds` means "every environment of the product".
 */
export interface ScopeTarget {
  /** Watchtower product id. */
  readonly productId: string;
  /** Watchtower environment ids allowed for the product (empty = all). */
  readonly environmentIds: ReadonlyArray<string>;
}
