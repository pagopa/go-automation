/**
 * ProfileQueryResult - Result of querying a single AWS profile
 */

import type { AWS } from '@go-automation/go-common';

/** Result of querying a single AWS profile. */
export type ProfileQueryResult = ProfileQuerySuccess | ProfileQueryFailure;

/**
 * Successful profile query result
 */
export interface ProfileQuerySuccess {
  readonly status: 'success';
  readonly profile: string;
  readonly items: ReadonlyArray<AWS.AlarmHistoryItem>;
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
