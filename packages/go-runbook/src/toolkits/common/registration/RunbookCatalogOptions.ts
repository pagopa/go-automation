import type { DownstreamCatalogs } from '../analysis/validation/DownstreamCatalogs.js';

/** Options of a {@link RunbookCatalog}: data the validation needs from the inventory. */
export interface RunbookCatalogOptions {
  /** Downstream catalog of each product, checked against the analysis annotations. */
  readonly downstreamCatalogs: DownstreamCatalogs;
}
