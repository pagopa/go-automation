/**
 * How a runbook reads its evidence.
 *
 * - `partial`: a read keeps what it got when part of it fails, and a step that fails after some evidence was collected
 *   leaves the execution completed on partial evidence (an analysis).
 * - `strict`: a read fails as a whole, and a failing step fails the execution (a procedure, which needs every
 *   required step).
 */
export type ReadPolicy = 'partial' | 'strict';
