/**
 * Types of runbook supported by the engine.
 *
 * - `'alarm-resolution'`: investigation and resolution of CloudWatch alarms
 * - `'data-verification'`: data consistency checks
 * - `'data-update'`: operational data updates
 * - `'health-check'`: service health verification
 */
export type RunbookType = 'alarm-resolution' | 'data-verification' | 'data-update' | 'health-check';
