import type { LogAction } from './CaseAction.js';
import { interpolatePlaceholders } from '../core/templatePlaceholders.js';

/** Marker a matched known case is rendered under. */
const KNOWN_CASE_PREFIX = '[CASO NOTO]';

/** Marker an unidentified outcome is rendered under. */
const UNKNOWN_CASE_PREFIX = '[CASO NON RICONOSCIUTO]';

/** Stands in for a placeholder the run never resolved. */
export const UNAVAILABLE_VALUE = 'non disponibile';

/** A row with its placeholders resolved, ready to render. */
export interface ResolvedLogActionRow {
  readonly field: string;
  readonly value: string;
}

/** Values a log action interpolates against. */
export interface LogActionValues {
  readonly vars: ReadonlyMap<string, string>;
  readonly params: ReadonlyMap<string, string>;
}

/**
 * Resolves the rows of a log action against the final context.
 *
 * Each value is interpolated on its own, so a value containing `:` or a
 * newline cannot be mistaken for a row separator. A placeholder the run
 * never produced resolves to {@link UNAVAILABLE_VALUE} rather than leaking
 * `{{vars.x}}` to the reader.
 *
 * @param action - The log action to resolve
 * @param values - Final `vars` and `params`
 * @returns The rows, in declaration order
 */
export function resolveLogActionRows(action: LogAction, values: LogActionValues): ReadonlyArray<ResolvedLogActionRow> {
  return (action.details ?? []).map(([field, template]) => ({
    field,
    value: interpolatePlaceholders(template, values, { missingValue: UNAVAILABLE_VALUE }),
  }));
}

/**
 * Renders a log action as the text published in the runbook output.
 *
 * The serialisation runs one way only — structure to text — so nothing
 * downstream has to parse it back to know what the rows were.
 *
 * @param action - The log action to render
 * @param values - Final `vars` and `params`
 * @returns The prefixed title followed by one `Etichetta: valore` line per row
 */
export function renderLogActionText(action: LogAction, values: LogActionValues): string {
  const title = interpolatePlaceholders(action.title, values, { missingValue: UNAVAILABLE_VALUE });
  const prefix = prefixFor(action);
  const heading = prefix === undefined ? title : `${prefix} ${title}`;
  return [heading, ...resolveLogActionRows(action, values).map((row) => `${row.field}: ${row.value}`)].join('\n');
}

/** The marker the action's rendering mode puts in front of the title. */
function prefixFor(action: LogAction): string | undefined {
  if (action.renderAs === 'known-case') return KNOWN_CASE_PREFIX;
  if (action.renderAs === 'unknown-case') return UNKNOWN_CASE_PREFIX;
  return undefined;
}
