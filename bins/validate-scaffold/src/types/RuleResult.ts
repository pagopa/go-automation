/**
 * Result of a single scaffold rule validation
 */
export interface RuleResult {
  /** Name of the rule that was checked */
  readonly rule: string;

  /** Whether the rule passed validation */
  readonly passed: boolean;

  /** Details about the failure (present only when passed is false) */
  readonly message?: string;
}
