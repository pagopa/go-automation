/**
 * Controls how the optional API Gateway execution-log branch interacts with
 * the application-log traversal.
 *
 * - `terminal`: preserve the legacy behaviour. A query failure fails the
 *   runbook and an unresolved query stops before application logs.
 * - `best-effort`: execution logs are enrichment. Query failures and
 *   unresolved rows do not prevent the service-log traversal.
 */
export type ApiGwExecutionLogAnalysisMode = 'terminal' | 'best-effort';
