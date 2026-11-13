/**
 * Categories of runbook steps.
 * Each category represents a different responsibility in the execution pipeline.
 */
export type StepKind = 'data' | 'transform' | 'check' | 'mutation' | 'control';
