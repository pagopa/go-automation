/** Characters allowed in a runbook id. */
const ALLOWED_CHARS = /^[A-Za-z0-9._-]+$/;
/** A runbook id must start with an alphanumeric character. */
const STARTS_ALNUM = /^[A-Za-z0-9]/;
/** A runbook id must end with an alphanumeric character. */
const ENDS_ALNUM = /[A-Za-z0-9]$/;

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
  if (!ALLOWED_CHARS.test(id)) {
    return 'Usa solo lettere, numeri, ".", "-" e "_" (niente spazi o "/").';
  }
  if (!STARTS_ALNUM.test(id) || !ENDS_ALNUM.test(id)) {
    return 'Il runbook id deve iniziare e finire con una lettera o un numero.';
  }
  return undefined;
}
