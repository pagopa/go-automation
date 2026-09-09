/**
 * Watchtower product a runbook belongs to.
 *
 * Declared once on the registry entry: no type ties a runbook to its product, so
 * this is what selects the downstream catalog at build time and gives the Fase 0
 * coverage check the runbook → product map.
 */
export const RunbookProducts = {
  SEND: 'SEND',
  INTEROP: 'INTEROP',
} as const;

export type RunbookProduct = (typeof RunbookProducts)[keyof typeof RunbookProducts];
