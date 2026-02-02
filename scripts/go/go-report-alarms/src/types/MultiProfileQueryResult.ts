/**
 * MultiProfileQueryResult - Aggregated result from querying multiple AWS profiles
 */

import type { AlarmHistoryItem } from '@aws-sdk/client-cloudwatch';
import type { ProfileQuerySuccess, ProfileQueryFailure } from './ProfileQueryResult.js';

/**
 * Aggregated result from querying all AWS profiles
 */
export interface MultiProfileQueryResult {
  /** All alarm history items from successful profiles */
  readonly items: ReadonlyArray<AlarmHistoryItem>;

  /** Total item count across all successful profiles */
  readonly totalItemCount: number;

  /** Successfully queried profiles */
  readonly successfulProfiles: ReadonlyArray<ProfileQuerySuccess>;

  /** Failed profile queries */
  readonly failedProfiles: ReadonlyArray<ProfileQueryFailure>;

  /** Whether all profiles succeeded */
  readonly allSucceeded: boolean;

  /** Total number of profiles queried */
  readonly profileCount: number;
}
