import { KNOWN_ERROR_COMMON_ACRONYM } from './KNOWN_ERROR_COMMON_ACRONYM.js';
import type { RunbookKind } from './RunbookKind.js';
import type { RunbookProduct } from './RunbookProduct.js';

const KEY_SEPARATOR = /[-_.]+/;
/** Where a lowercase letter is followed by an uppercase one: `jwksCacheRefresh` gives `jwks`, `Cache`, `Refresh`. */
const LOWER_TO_UPPER = /(?<=[a-z])(?=[A-Z])/;
const UPPERCASE_WORD = /^[A-Z0-9]{2,}$/;
const HAS_LETTER = /[A-Z]/;
const DIGIT = /\d/g;
const NUMBER = /^\d+$/;

/**
 * The acronym of a runbook key: one part per word, split at `-`, `_`, `.` and where a lowercase letter is followed by an
 * uppercase one. An uppercase word stays whole (`IPA`, `B2B`); any other gives its initial and its digits (`k8s` → `K8`,
 * `5xx` → `5`, `V2Lambda` → `V2`, `ELBAlarm` → `E`).
 */
function acronymOf(runbookKey: string): string {
  return runbookKey
    .split(KEY_SEPARATOR)
    .flatMap((part) => part.split(LOWER_TO_UPPER))
    .filter((word) => word !== '')
    .map((word) =>
      UPPERCASE_WORD.test(word) && HAS_LETTER.test(word)
        ? word
        : `${word.charAt(0).toUpperCase()}${(word.slice(1).match(DIGIT) ?? []).join('')}`,
    )
    .join('');
}

/** The abbreviation of a name: the first three letters of each word, uppercase, or the whole word when it is a number. */
function abbreviationOf(name: string): string {
  return name
    .split('-')
    .filter((word) => word !== '')
    .map((word) => (NUMBER.test(word) ? word : word.slice(0, 3)).toUpperCase())
    .join('-');
}

/**
 * Composes the code of a known error, the same in go-runbook, in go-runbooks and in Watchtower:
 * `<PRODUCT>_<FAMILY>_<RUNBOOK ACRONYM>_<ABBREVIATION>`. The code is written in the source once, when the known error
 * is born, and never recomputed: renaming a runbook does not change it.
 *
 * @param product - The product of the runbook
 * @param kind - The family of the runbook
 * @param runbookKey - The key of the runbook, or `undefined` for a known error a family adds to several runbooks
 * @param name - The kebab-case name of the known error, as `attribute-registry-temporary-network-errors`
 * @returns The code of the known error
 *
 * @example
 * ```typescript
 * knownErrorCodeOf('INTEROP', 'K8S', 'k8s-interop-be-attribute-registry-readmodel-writer-sql-errors',
 *   'attribute-registry-temporary-network-errors'); // 'INTEROP_K8S_K8IBARRWSE_ATT-REG-TEM-NET-ERR'
 * knownErrorCodeOf('SEND', 'LAMBDA', undefined, 'lambda-timeout'); // 'SEND_LAMBDA_COMMON_LAM-TIM'
 * ```
 */
export function knownErrorCodeOf(
  product: RunbookProduct,
  kind: RunbookKind,
  runbookKey: string | undefined,
  name: string,
): string {
  const acronym = runbookKey === undefined ? KNOWN_ERROR_COMMON_ACRONYM : acronymOf(runbookKey);
  return `${product}_${kind}_${acronym}_${abbreviationOf(name)}`;
}
