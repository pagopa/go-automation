/** `catalog` (as `default`) and `catalogs.<name>` of a `pnpm-workspace.yaml`: catalog name → package → range. */
export type CatalogTable = ReadonlyMap<string, ReadonlyMap<string, string>>;
