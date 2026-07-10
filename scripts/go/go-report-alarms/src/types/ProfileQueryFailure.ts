/**
 * ProfileQueryFailure - Failed result of querying a single AWS profile
 */

/**
 * Failed profile query result
 */
export interface ProfileQueryFailure {
  readonly status: 'failure';
  readonly profile: string;
  readonly error: Error;
}
