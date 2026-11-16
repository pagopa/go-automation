import type { RunbookProduct } from '../../registration/RunbookProduct.js';

/**
 * Downstream catalog of each product: the names an analysis annotation may
 * reference. The inventory composes it from the product toolkits and injects
 * it into the registry (EVO-RBREORG-OPUS-01 §7.5, P17).
 */
export type DownstreamCatalogs = Readonly<Record<RunbookProduct, ReadonlySet<string>>>;
