/** Allowed runbook id pattern: starts/ends alphanumeric, inner `.`, `-`, `_`. */
const RUNBOOK_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/**
 * Validates a runbook id, which also becomes the runbook directory name.
 *
 * @param id - Candidate runbook id
 * @returns An error message when invalid, or `undefined` when valid
 */
export function runbookIdError(id: string): string | undefined {
  if (id.length === 0) {
    return 'Il runbook id non può essere vuoto.';
  }
  if (id !== id.trim()) {
    return 'Il runbook id non può avere spazi iniziali o finali.';
  }
  if (!RUNBOOK_ID_PATTERN.test(id)) {
    return 'Usa solo lettere, numeri, ".", "-" e "_" (niente spazi o "/").';
  }
  return undefined;
}
