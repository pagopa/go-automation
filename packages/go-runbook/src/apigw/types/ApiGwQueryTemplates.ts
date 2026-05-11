/**
 * Overrides for the CloudWatch Logs Insights templates used by
 * {@link createApiGwAlarmRunbook}.
 *
 * Both fields are optional; unset overrides fall back to the canonical
 * templates re-exported from `apigw/queries`.
 */
export interface ApiGwQueryTemplates {
  /**
   * Override for the API Gateway AccessLog query.
   *
   * Must contain the `{{minStatusCode}}` placeholder, which is resolved
   * at build time by the factory.
   */
  readonly apiGwQuery?: string;
  /**
   * Override for the per-service log query template.
   *
   * Must contain the `{{FILTER_CLAUSE}}` placeholder so that
   * {@link queryServiceLogs} can inject the runtime filter at execution
   * time.
   */
  readonly serviceQueryTemplate?: string;
}
