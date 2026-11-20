/** Variable published on a node once its branch is concluded: `diagnosed`, `incomplete` or `undiagnosed`. */
export const BRANCH_OUTCOME_VAR = 'branchOutcome';

/** Suffixes of the variables a descent publishes on its parent, after the prefix of the level. */
const DESCENT_SUFFIXES: ReadonlyArray<string> = ['LookupState', 'LogCountAllVisits', 'LogCount'];

/** Separator of an exclusion variable: `<prefix>Exclusion.<name>`. */
const EXCLUSION_INFIX = 'Exclusion.';

/**
 * The variable, published on the parent, with how the read of the child level ended for it.
 *
 * @param prefix - Variable prefix of the child level
 * @returns `<prefix>LookupState`
 *
 * @example
 * ```typescript
 * lookupStateVar('delivery'); // 'deliveryLookupState'
 * ```
 */
export function lookupStateVar(prefix: string): string {
  return `${prefix}LookupState`;
}

/**
 * The variable, published on the parent, with the rows the last read of the child level found for it.
 *
 * @param prefix - Variable prefix of the child level
 * @returns `<prefix>LogCount`
 */
export function logCountVar(prefix: string): string {
  return `${prefix}LogCount`;
}

/**
 * The variable, published on the parent, with the rows every read of the child level found for it.
 *
 * @param prefix - Variable prefix of the child level
 * @returns `<prefix>LogCountAllVisits`
 */
export function logCountAllVisitsVar(prefix: string): string {
  return `${prefix}LogCountAllVisits`;
}

/**
 * The variable, published on the parent, with whether an excluded diagnosis is in the child read.
 *
 * @param prefix - Variable prefix of the child level
 * @param name - Name of the exclusion
 * @returns `<prefix>Exclusion.<name>`
 */
export function exclusionVar(prefix: string, name: string): string {
  return `${prefix}${EXCLUSION_INFIX}${name}`;
}

/**
 * Whether a variable is one a descent to the level with the given prefix publishes on its parent.
 *
 * @param name - Variable name
 * @param prefix - Variable prefix of the child level
 * @returns `true` for `<prefix>LookupState`, `<prefix>LogCount`, `<prefix>LogCountAllVisits`, `<prefix>Exclusion.*`
 */
export function isDescentVar(name: string, prefix: string): boolean {
  if (!name.startsWith(prefix)) return false;
  const rest = name.slice(prefix.length);
  return DESCENT_SUFFIXES.includes(rest) || rest.startsWith(EXCLUSION_INFIX);
}
