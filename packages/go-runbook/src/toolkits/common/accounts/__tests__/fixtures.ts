import { type AWSAccountDirectoryEntry, parseAwsAccountDirectory } from '@pagopa/go-aws/profiles';

import { InMemoryAwsAccountsPort } from '../../testing/InMemoryAwsAccountsPort.js';
import type { InMemoryAwsAccountsPortOptions } from '../../testing/InMemoryAwsAccountsPortOptions.js';
import { isAwsAccountError } from '../AwsAccountError.js';
import type { AwsAccountErrorCode } from '../AwsAccountErrorCode.js';
import type { AwsLogicalAccount } from '../AwsLogicalAccount.js';
import { parseAwsLogicalAccount } from '../parseAwsLogicalAccount.js';

/** Synthetic directory: two logical accounts in prod and uat, plus an alias of core in dev. */
export const DIRECTORY: ReadonlyArray<AWSAccountDirectoryEntry> = parseAwsAccountDirectory([
  'shop/core/prod=000000000101',
  'shop/extra/prod=000000000102',
  'other/main/prod=000000000103',
  'shop/core/uat=000000000201',
  'shop/extra/uat=000000000202',
  'shop/core/dev=000000000301',
  'shop/alias/dev=000000000301',
]);

export const CORE: AwsLogicalAccount = parseAwsLogicalAccount('shop/core');
export const EXTRA: AwsLogicalAccount = parseAwsLogicalAccount('shop/extra');
export const ALIAS: AwsLogicalAccount = parseAwsLogicalAccount('shop/alias');
export const REGION = 'eu-south-1';

/**
 * In-memory port over {@link DIRECTORY}.
 *
 * @param options - Overrides of the execution data
 * @returns The port
 */
export function port(options: Partial<InMemoryAwsAccountsPortOptions> = {}): InMemoryAwsAccountsPort {
  return new InMemoryAwsAccountsPort({ directory: DIRECTORY, region: REGION, ...options });
}

/** Predicate for `assert.throws` / `assert.rejects`. */
type ErrorMatcherFn = (error: unknown) => boolean;

/**
 * Matches an account error with the given code.
 *
 * @param code - Expected code
 * @returns The matcher
 */
export function rejectsWith(code: AwsAccountErrorCode): ErrorMatcherFn {
  return (error) => isAwsAccountError(error) && error.code === code;
}
