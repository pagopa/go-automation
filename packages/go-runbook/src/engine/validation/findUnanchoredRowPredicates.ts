import type { Condition } from '../types/Condition.js';
import type { KnownCase } from '../types/KnownCase.js';
import { parseStepRef } from '../context/parseStepRef.js';
import { conditionLeafRefs } from './conditionLeafRefs.js';

/** Related rows a node reads beside its own: they anchor a second predicate on the same read. */
const RELATED_PATHS: ReadonlySet<string> = new Set(['siblings', 'context']);

/**
 * The first known case with an `all(...)` that reads the rows of the same level read in two of its branches, none of
 * them on the related rows (`steps.<id>.siblings`, `steps.<id>.context`).
 *
 * In an error tree every error row of a level read is a node: two predicates on the rows of the same read would need
 * the same row to satisfy both, while a signature split over two rows needs one of them anchored on the node and the
 * other read from its siblings or its context.
 *
 * Complexity: O(C) over the nodes of the conditions.
 *
 * @param knownCases - Cases of the runbook
 * @param levelReads - Ids of the reads of the levels below the root
 * @returns The case and the read, or nothing
 *
 * @example
 * ```typescript
 * findUnanchoredRowPredicates(cases, new Set(['query-pn-external-registries']));
 * ```
 */
export function findUnanchoredRowPredicates(
  knownCases: ReadonlyArray<KnownCase>,
  levelReads: ReadonlySet<string>,
): { readonly caseId: string; readonly stepId: string } | undefined {
  for (const knownCase of knownCases) {
    const stepId = findIn(knownCase.condition, levelReads);
    if (stepId !== undefined) return { caseId: knownCase.id, stepId };
  }
  return undefined;
}

function findIn(condition: Condition, levelReads: ReadonlySet<string>): string | undefined {
  switch (condition.type) {
    case 'and': {
      const plain = new Map<string, number>();
      const related = new Set<string>();
      for (const child of condition.conditions) {
        for (const ref of new Set(conditionLeafRefs(child))) {
          const stepRef = parseStepRef(ref);
          if (stepRef === undefined || !levelReads.has(stepRef.stepId)) continue;
          const [first, ...rest] = stepRef.path;
          // The rows of the read itself (`steps.<id>`) or its related rows (`steps.<id>.siblings`); any other path is
          // not a row predicate of the read.
          if (first === undefined) plain.set(stepRef.stepId, (plain.get(stepRef.stepId) ?? 0) + 1);
          else if (rest.length === 0 && RELATED_PATHS.has(first)) related.add(stepRef.stepId);
        }
      }
      for (const [stepId, count] of plain) if (count >= 2 && !related.has(stepId)) return stepId;
      for (const child of condition.conditions) {
        const found = findIn(child, levelReads);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    case 'or': {
      for (const child of condition.conditions) {
        const found = findIn(child, levelReads);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    case 'not':
      return findIn(condition.condition, levelReads);
    case 'compare':
    case 'pattern':
    case 'exists':
    case 'contains':
      return undefined;
    default: {
      const exhaustive: never = condition;
      throw new Error(`Unhandled condition type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
