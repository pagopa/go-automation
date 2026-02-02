/**
 * ProfileQueryResult - Result of querying a single AWS profile
 */

import type { AlarmHistoryItem } from '@aws-sdk/client-cloudwatch';

/**
 * Result of querying a single AWS profile
 */
export type ProfileQueryResult = ProfileQuerySuccess | ProfileQueryFailure;

/**
 * Successful profile query result
 */
export interface ProfileQuerySuccess {
  readonly status: 'success';
  readonly profile: string;
  readonly items: ReadonlyArray<AlarmHistoryItem>;
  readonly itemCount: number;
}

/**
 * Failed profile query result
 */
export interface ProfileQueryFailure {
  readonly status: 'failure';
  readonly profile: string;
  readonly error: Error;
}

/**
 * Type guard for successful profile query
 */
export function isProfileQuerySuccess(result: ProfileQueryResult): result is ProfileQuerySuccess {
  return result.status === 'success';
}

/**
 * Type guard for failed profile query
 */
export function isProfileQueryFailure(result: ProfileQueryResult): result is ProfileQueryFailure {
  return result.status === 'failure';
}
