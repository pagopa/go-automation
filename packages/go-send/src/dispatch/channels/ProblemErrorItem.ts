/**
 * One item of `problem.errors[]` in a B2B error response.
 */
export interface ProblemErrorItem {
  readonly code?: string;
  readonly element?: string;
  readonly detail?: string;
}
