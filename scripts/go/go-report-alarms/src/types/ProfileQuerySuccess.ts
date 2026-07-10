/**
 * ProfileQuerySuccess - Successful result of querying a single AWS profile
 */

import type { AWS } from '@go-automation/go-common';

/**
 * Successful profile query result
 */
export interface ProfileQuerySuccess {
  readonly status: 'success';
  readonly profile: string;
  readonly items: ReadonlyArray<AWS.AlarmHistoryItem>;
  readonly itemCount: number;
}
