/**
 * How many errors a step observed and how many the runbook examined, in the unit of its family.
 *
 * The root level of an error tree examines every error it observes; a step that follows one error out of several
 * declares the others as observed and not examined.
 */
export interface ObservedErrors {
  readonly unit: 'request' | 'invocation' | 'errorRow';
  /** Distinct errors observed; a lower bound when `lowerBound` is set. */
  readonly observed: number;
  /** `true` when the enumeration was incomplete (saturated, unavailable, unread pages). */
  readonly lowerBound?: boolean;
  /** Errors actually examined. */
  readonly examined: number;
}
