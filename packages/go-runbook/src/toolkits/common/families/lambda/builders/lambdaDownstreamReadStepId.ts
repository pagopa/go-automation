/**
 * The id of the read of a downstream level of a Lambda runbook.
 *
 * @param downstream - Name of the downstream
 * @returns The step id
 *
 * @example
 * ```typescript
 * lambdaDownstreamReadStepId('pn-delivery'); // 'query-pn-delivery'
 * ```
 */
export function lambdaDownstreamReadStepId(downstream: string): string {
  return `query-${downstream}`;
}
