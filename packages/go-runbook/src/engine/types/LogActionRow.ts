/**
 * One `Etichetta: valore` row of a log action.
 *
 * The value is a template: `{{vars.x}}` and `{{params.x}}` are resolved
 * per row against the final context, so a value carrying `:` or a newline
 * — a stack trace, say — stays inside its own row.
 */
export type LogActionRow = readonly [label: string, template: string];
