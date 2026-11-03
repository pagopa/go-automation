/**
 * Content of the `requestId` column (§8.3): `per-category` joins the first
 * id of every category found (in category order) with `|`; `priority` keeps
 * only the id of the highest-priority category found.
 */
export type RequestIdSelect = 'per-category' | 'priority';
