import { normalize } from './text.js';

/**
 * Category → synonyms (IT/EN), used to detect error-keyword overlap between the
 * runbook case and the hand-written analysis text. Tunable.
 */
const SYNONYM_GROUPS: Readonly<Record<string, ReadonlyArray<string>>> = {
  timeout: ['timeout', 'timed out', 'task timed out', 'scadut', 'read timeout', 'endpoint request timed out'],
  'out-of-memory': ['out of memory', 'outofmemory', 'oom'],
  throttle: ['throttle', 'throttling', 'rate exceeded', 'toomanyrequests'],
  econnreset: ['econnreset', 'connection reset', 'socket hang up'],
  downstream: ['downstream', 'servizio esterno', 'fornitore esterno', 'external service'],
  authorizer: ['authorizer', 'authorization', 'iam policy', 'api key'],
};

/**
 * Returns the synonym categories whose any keyword appears in `text`.
 *
 * @param text - Free text (will be normalized internally)
 * @returns The matched category keys
 */
export function matchedKeywordCategories(text: string): ReadonlyArray<string> {
  const normalized = normalize(text);
  const matched: string[] = [];
  for (const [category, words] of Object.entries(SYNONYM_GROUPS)) {
    if (words.some((word) => normalized.includes(word))) {
      matched.push(category);
    }
  }
  return matched;
}
