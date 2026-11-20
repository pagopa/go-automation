import type { Condition } from '../types/Condition.js';
import type { KnownCase } from '../types/KnownCase.js';

const STEPS_PREFIX = 'steps.';

/** Related rows a node reads beside its own: they anchor a second predicate on the same read. */
const RELATED_SUFFIXES: ReadonlyArray<string> = ['.siblings', '.context'];

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
        for (const ref of rowRefs(child)) {
          const suffix = RELATED_SUFFIXES.find((candidate) => ref.endsWith(candidate));
          const stepId = suffix === undefined ? ref : ref.slice(0, -suffix.length);
          if (!levelReads.has(stepId)) continue;
          if (suffix !== undefined) related.add(stepId);
          else plain.set(stepId, (plain.get(stepId) ?? 0) + 1);
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

/** The distinct step refs (without `steps.`) a branch reads, at any depth. */
function rowRefs(condition: Condition): ReadonlySet<string> {
  const refs = new Set<string>();
  const visit = (node: Condition): void => {
    if (node.type === 'and' || node.type === 'or') for (const child of node.conditions) visit(child);
    else if (node.type === 'not') visit(node.condition);
    else if (node.ref.startsWith(STEPS_PREFIX)) refs.add(node.ref.slice(STEPS_PREFIX.length));
  };
  visit(condition);
  return refs;
}
