import { canonicalizeJson } from '@pagopa/go-common/json';

import type { KnownError } from '../../../engine/index.js';
import type { BuiltRegistration } from './BuiltRegistration.js';
import { KNOWN_ERROR_COMMON_ACRONYM } from './KNOWN_ERROR_COMMON_ACRONYM.js';

/** The longest code Watchtower accepts for a known error (`KNOWN_ERROR_CODE_MAX_LENGTH` of go-watchtower-pro). */
const MAX_CODE_LENGTH = 100;
/** `<PRODUCT>_<FAMILY>_<RUNBOOK ACRONYM>_<ABBREVIATION>`, as `knownErrorCodeOf` composes it. */
const CODE_FORMAT = /^[A-Z0-9]+_[A-Z0-9]+_[A-Z0-9]+_[A-Z0-9-]+$/;

/**
 * Rejects the codes of the catalog that Watchtower could not map one to one: a code out of form, one that does not
 * start with the product and the family of its runbook, one longer than {@link MAX_CODE_LENGTH} characters, and a code
 * given twice. Only a `COMMON` code, of a known error a family adds to several runbooks, repeats, and only with
 * declarations equal in content. Complexity: O(N) over the known errors of the catalog.
 *
 * @param registrations - Every runbook of the catalog, with its product and family
 * @throws Error on the first code that breaks a rule
 */
export function assertKnownErrorCodes(registrations: Iterable<BuiltRegistration>): void {
  const declarations = new Map<string, { readonly runbookId: string; readonly knownError: KnownError }>();
  for (const { runbook, product, kind } of registrations) {
    for (const knownError of runbook.knownErrors) {
      const where = `Runbook "${runbook.metadata.id}": known error "${knownError.code}"`;
      if (!CODE_FORMAT.test(knownError.code)) throw new Error(`${where} is not <PRODUCT>_<FAMILY>_<ACRONYM>_<NAME>`);
      const [codeProduct, codeKind, acronym] = knownError.code.split('_');
      if (codeProduct !== product || codeKind !== kind)
        throw new Error(`${where} does not start with ${product}_${kind}_`);
      if (knownError.code.length > MAX_CODE_LENGTH) throw new Error(`${where} is longer than ${MAX_CODE_LENGTH}`);
      const declared = declarations.get(knownError.code);
      if (declared === undefined) {
        declarations.set(knownError.code, { runbookId: runbook.metadata.id, knownError });
      } else if (
        acronym !== KNOWN_ERROR_COMMON_ACRONYM ||
        canonicalizeJson(declared.knownError) !== canonicalizeJson(knownError)
      ) {
        throw new Error(`${where} is also a known error of "${declared.runbookId}": only an equal COMMON one repeats`);
      }
    }
  }
}
