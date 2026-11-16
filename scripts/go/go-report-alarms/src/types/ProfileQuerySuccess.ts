/**
 * ProfileQuerySuccess - Successful result of querying a single AWS profile
 */

import type { AlarmHistoryItem } from '@pagopa/go-aws/cloudwatch-alarms';

/**
 * Successful profile query result
 */
export interface ProfileQuerySuccess {
  readonly status: 'success';
  readonly profile: string;
  readonly items: ReadonlyArray<AlarmHistoryItem>;
  readonly itemCount: number;
}
