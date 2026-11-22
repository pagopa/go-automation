/**
 * Directives controlling the execution flow between steps.
 *
 * - `'continue'`: proceed to the next step in sequence
 * - `'stop'`: terminate the runbook execution
 */
export type FlowDirective = 'continue' | 'stop';
