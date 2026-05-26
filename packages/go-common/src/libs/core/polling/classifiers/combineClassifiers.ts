import type { GORetryAdvice } from '../GORetryAdvice.js';
import type { GORetryClassifier } from '../GORetryClassifier.js';
import type { GORetryDecision } from '../GORetryDecision.js';

/**
 * Combines multiple classifiers with **first-match-wins** semantics.
 *
 * Each classifier is consulted in order; the first one returning a decision
 * other than `'unknown'` wins. If all return `'unknown'`, the combined
 * classifier returns `{ decision: 'unknown' }`.
 *
 * **Ordering matters**: place more specific classifiers earlier
 * (e.g. `httpRetryAfterClassifier` before a generic network one) so the
 * advice with the most precise information is the one that prevails.
 *
 * Preserves `GORetryAdvice.delayMs` when the winning classifier returns it.
 *
 * @param classifiers - Classifiers to consult in order.
 *
 * @example
 * ```typescript
 * const classifier = combineClassifiers(
 *   httpRetryAfterClassifier(new Set([429, 503])),
 *   awsThrottlingClassifier,
 *   awsNetworkClassifier,
 * );
 * ```
 */
export function combineClassifiers(...classifiers: ReadonlyArray<GORetryClassifier>): GORetryClassifier {
  return {
    classify(error: unknown): GORetryAdvice {
      for (const classifier of classifiers) {
        const advice = normalizeAdvice(classifier.classify(error));
        if (advice.decision !== 'unknown') return advice;
      }
      return { decision: 'unknown' };
    },
  };
}

/**
 * Normalises a classifier output to {@link GORetryAdvice}.
 *
 * Bare {@link GORetryDecision} strings are wrapped in `{ decision }`;
 * existing advice objects are passed through unchanged.
 *
 * Used internally by `combineClassifiers` and by `GORetryRunner` to handle
 * both classifier return shapes uniformly.
 *
 * @param adviceOrDecision - Either a literal decision or a structured advice.
 */
export function normalizeAdvice(adviceOrDecision: GORetryDecision | GORetryAdvice): GORetryAdvice {
  return typeof adviceOrDecision === 'string' ? { decision: adviceOrDecision } : adviceOrDecision;
}
