/**
 * Validated configuration for go-rta-check (CLI params + env).
 *
 * Most fields are optional: when omitted they are resolved from env or via
 * interactive prompts (product/alarm selection, period, credentials).
 */
export interface GoRtaCheckConfig {
  /** Watchtower base URL (or env `WATCHTOWER_BASE_URL`). */
  readonly watchtowerUrl?: string;
  /** Watchtower login email (or env `WATCHTOWER_EMAIL`, else prompt). */
  readonly watchtowerEmail?: string;
  /** Watchtower login password (or env `WATCHTOWER_PASSWORD`, else prompt). */
  readonly watchtowerPassword?: string;
  /** Watchtower product id; when omitted the user selects it interactively. */
  readonly productId?: string;
  /** Watchtower environment id to filter occurrences; when omitted: all environments (or prompt). */
  readonly environmentId?: string;
  /** Alarm name (= runbook id); when omitted the user selects it interactively. */
  readonly alarmName?: string;
  /** Period start (ISO 8601) on `firedAt`; prompted when omitted. */
  readonly dateFrom?: string;
  /** Period end (ISO 8601) on `firedAt`; prompted when omitted. */
  readonly dateTo?: string;
  /** AWS SSO profile names used to run the runbook (not needed for --dry-run). */
  readonly awsProfiles?: ReadonlyArray<string>;
  /** Max concurrent runbook executions (default 1). */
  readonly concurrency?: number;
  /** Cap the number of occurrences processed (for quick tests). */
  readonly limit?: number;
  /** Fetch Watchtower data and preview only, without running any runbook. */
  readonly dryRun?: boolean;
  /** Ignore the resume cache and re-run every occurrence. */
  readonly force?: boolean;
  /** Report artifacts to write: `json` | `md` | `all` (default `all`). */
  readonly outputFormat?: string;
  /** Use `IGNORABLE` analyses as comparison oracle too (default false). */
  readonly includeIgnorable?: boolean;
  /** Use non-`COMPLETED` analyses as comparison oracle too (default false). */
  readonly includeIncomplete?: boolean;
  /** V2 matcher strategy: `ai` (default) or `lexical`. */
  readonly analysisMatcher?: string;
  /** GO-AI semantic equivalence threshold, 0..100 (default 70). */
  readonly goAiSemanticThreshold?: number;
  /** Fallback to lexical matcher when GO-AI fails (default true). */
  readonly goAiFallbackToLexical?: boolean;
  /** Standard AWS region used by the script credential/profile flow. */
  readonly awsRegion?: string;
  /** Standard AWS profile for GO-AI Bedrock calls. */
  readonly awsProfile?: string;
}
