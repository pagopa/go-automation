/**
 * The step id and the property path after it of a step ref (`steps.<id>…`).
 *
 * @param ref - Reference of a condition or of an evidence array
 * @returns The step id and the segments after it, or nothing when the ref does not name a step
 *
 * @example
 * ```typescript
 * parseStepRef('steps.query-logs.output.rows'); // { stepId: 'query-logs', path: ['output', 'rows'] }
 * parseStepRef('vars.statusCode'); // undefined
 * ```
 */
export function parseStepRef(
  ref: string,
): { readonly stepId: string; readonly path: ReadonlyArray<string> } | undefined {
  const [source, stepId, ...path] = ref.split('.');
  if (source !== 'steps' || stepId === undefined || stepId === '') return undefined;
  return { stepId, path };
}
