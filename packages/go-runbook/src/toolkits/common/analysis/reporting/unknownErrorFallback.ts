import { logAction } from '../../../../engine/index.js';
import type { CaseAction, LogActionRow } from '../../../../engine/index.js';

/**
 * What the operator reads when no known error matched, whatever the runbook
 * family. One wording for one situation: a runbook that has something more
 * specific to say passes its own title instead.
 */
export const UNKNOWN_ERROR_TITLE = "Impossibile identificare univocamente la causa dell'errore.";

/**
 * Builds the action executed when no known error matched.
 *
 * Callers supply the wording and the rows; the marker and the rendering
 * mode are this helper's business. Values are usually `{{vars.x}}`
 * placeholders, resolved one row at a time against the final context.
 *
 * @param title - What the runbook could not determine, without the prefix
 * @param rows - Ordered `label` / `value` pairs summarising the evidence
 * @returns A warning {@link CaseAction} rendered as an unknown-error table
 *
 * @example
 * ```typescript
 * unknownErrorFallback("Impossibile identificare la causa dell'errore.", [
 *   ['Servizio', service.name],
 *   ['Errore', `{{vars.${service.varPrefix}ErrorMsg}}`],
 * ]);
 * ```
 */
export function unknownErrorFallback(title: string, rows: ReadonlyArray<LogActionRow>): CaseAction {
  return logAction({ level: 'warn', renderAs: 'unknown-error', title, details: rows });
}
