/**
 * Structural contract of one CloudWatch Logs Insights result cell, independent from the SDK.
 *
 * The SDK `ResultField` (`field?: string | undefined; value?: string | undefined`) is
 * assignable to it, so results returned by `AWSCloudWatchLogsService` pass unchanged.
 */
export interface GOLogsInsightsResultField {
  // Explicit `| undefined`: required under exactOptionalPropertyTypes for the SDK type to be assignable.
  readonly field?: string | undefined;
  readonly value?: string | undefined;
}
