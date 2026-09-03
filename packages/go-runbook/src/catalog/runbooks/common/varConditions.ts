import type { Condition } from '../framework.js';

/**
 * Matches a regex against a context variable.
 *
 * Counterpart of {@link stepEvidenceMatches} for the `vars.*` namespace: the
 * variables a runbook extracts from its queries (`…ErrorMsg`, `…LogCount`,
 * `apiGwHttpMethod`, …) rather than a step's raw evidence.
 *
 * @param varName - Variable name, without the `vars.` prefix
 * @param regex - Regular expression source tested against the value
 * @returns The equivalent runbook condition
 */
export function varMatches(varName: string, regex: string): Condition {
  return { type: 'pattern', ref: `vars.${varName}`, regex };
}

/**
 * Checks a context variable for equality against a literal.
 *
 * Only `==` is offered on purpose: every comparison in the catalog is an
 * equality check, and runbook variables are strings, so ordering operators
 * would compare lexicographically and surprise the caller. Build the literal
 * condition by hand on the day an ordering comparison is genuinely needed.
 *
 * @param varName - Variable name, without the `vars.` prefix
 * @param value - Value the variable must equal
 * @returns The equivalent runbook condition
 */
export function varEquals(varName: string, value: string | number | boolean): Condition {
  return { type: 'compare', ref: `vars.${varName}`, operator: '==', value };
}

/**
 * Checks that a context variable holds a meaningful value: not undefined,
 * not null, and not an empty string.
 *
 * @param varName - Variable name, without the `vars.` prefix
 * @returns The equivalent runbook condition
 */
export function varExists(varName: string): Condition {
  return { type: 'exists', ref: `vars.${varName}` };
}
