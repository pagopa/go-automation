import type { RunbookContext } from '../../../engine/types/RunbookContext.js';

/**
 * Value of a runbook variable, trimmed; `undefined` when it is missing or blank
 * (EVO-RBREORG-OPUS-01 P30, shared by the INTEROP query steps).
 *
 * @param context - Runbook context
 * @param key - Variable name
 * @returns The trimmed value, or `undefined`
 */
export function readNonBlankVar(context: RunbookContext, key: string): string | undefined {
  const value = context.vars.get(key)?.trim();
  return value === undefined || value === '' ? undefined : value;
}
