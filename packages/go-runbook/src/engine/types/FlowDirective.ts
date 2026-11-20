/**
 * Directives controlling the execution flow between steps.
 *
 * - `'continue'`: proceed to the next step in sequence
 * - `'stop'`: terminate the runbook execution
 * - `{ goTo: string }`: jump to the step with the specified id
 */
export type FlowDirective = 'continue' | 'stop' | { readonly goTo: string };

/**
 * String representation of flow directives, used in execution traces and logs.
 * Preserves known directive strings for readability, while allowing custom directives.
 */
export type FlowDirectiveString = 'continue' | 'stop' | (string & {});
