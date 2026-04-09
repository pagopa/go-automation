import type { RuleSeverity } from './ScaffoldRule.js';

/**
 * Result of a single scaffold rule validation
 */
export interface RuleResult {
  /** Name of the rule that was checked */
  readonly rule: string;

  /** Whether the rule passed validation */
  readonly passed: boolean;

  /** Severity level: 'error' blocks CI, 'warning' is informational only */
  readonly severity: RuleSeverity;

  /** File path relative to the script root (used for GitHub Actions annotations) */
  readonly file?: string | undefined;

  /** Details about the failure (present only when passed is false) */
  readonly message?: string;
}
