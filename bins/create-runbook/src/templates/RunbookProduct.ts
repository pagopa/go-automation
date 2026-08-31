/**
 * Watchtower product owning the alarms of a runbook.
 *
 * Mirrors `RunbookProduct` in go-runbook: the scaffolder is standalone and
 * cannot import the package, so the union is repeated here.
 */
export type RunbookProduct = 'SEND' | 'INTEROP';
