import { logAction } from './ActionFactories.js';
import type { CaseAction } from './CaseAction.js';

/**
 * Prefix on which `ActionExecutor` recognises an unidentified outcome.
 *
 * It is not decoration: the prefix is what makes the executor render the
 * message as a table and substitute `non disponibile` for placeholders the
 * run never resolved. A fallback that spells it differently loses both, and
 * leaks raw `{{vars.x}}` into the operator's output and into
 * `RunbookOutput.outcome.fallbackMessage`.
 */
export const UNKNOWN_CASE_PREFIX = '[CASO NON RICONOSCIUTO]';

/** One `Label: value` row of an unknown-case summary. */
export type UnknownCaseRow = readonly [label: string, value: string];

/**
 * Builds the action executed when no known case matched.
 *
 * Owning the prefix here is the point: callers supply the wording and the
 * rows, never the marker the executor keys off. Values are usually
 * `{{vars.x}}` placeholders resolved against the final context.
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
export function unknownCaseFallback(title: string, rows: ReadonlyArray<UnknownCaseRow>): CaseAction {
  const lines = [`${UNKNOWN_CASE_PREFIX} ${title}`, ...rows.map(([label, value]) => `${label}: ${value}`)];
  return logAction({ level: 'warn', renderAs: 'unknown-case', message: lines.join('\n') });
}
