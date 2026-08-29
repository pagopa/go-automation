import { logAction } from './ActionFactories.js';
import type { CaseAction, LogActionRow } from './CaseAction.js';

/**
 * Builds the action executed when no known case matched.
 *
 * Callers supply the wording and the rows; the marker and the rendering
 * mode are this helper's business. Values are usually `{{vars.x}}`
 * placeholders, resolved one row at a time against the final context.
 *
 * @param title - What the runbook could not determine, without the prefix
 * @param rows - Ordered `label` / `value` pairs summarising the evidence
 * @returns A warning {@link CaseAction} rendered as an unknown-case table
 *
 * @example
 * ```typescript
 * unknownCaseFallback("Impossibile identificare la causa dell'errore.", [
 *   ['Servizio', service.name],
 *   ['Errore', `{{vars.${service.varPrefix}ErrorMsg}}`],
 * ]);
 * ```
 */
export function unknownCaseFallback(title: string, rows: ReadonlyArray<LogActionRow>): CaseAction {
  return logAction({ level: 'warn', renderAs: 'unknown-case', title, details: rows });
}
