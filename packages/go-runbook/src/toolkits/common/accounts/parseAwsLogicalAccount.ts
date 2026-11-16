import type { AwsLogicalAccount } from './AwsLogicalAccount.js';

const LOGICAL_ACCOUNT_PATTERN = /^[a-z0-9-]+\/[a-z0-9-]+$/u;

/**
 * Validates and brands a logical account (EVO-AWSACCT-OPUS-01 §5.1).
 *
 * @param value - `<product>/<account>`, lower-case slugs
 * @returns The branded logical account
 * @throws Error when the value does not have the expected form
 *
 * @example
 * ```typescript
 * const core = parseAwsLogicalAccount('send/core');
 * ```
 */
export function parseAwsLogicalAccount(value: string): AwsLogicalAccount {
  if (!LOGICAL_ACCOUNT_PATTERN.test(value)) {
    throw new Error(`Invalid logical AWS account "${value}": expected <product>/<account> in lower case`);
  }
  // Safe: validated by the pattern above.
  return value as AwsLogicalAccount;
}
