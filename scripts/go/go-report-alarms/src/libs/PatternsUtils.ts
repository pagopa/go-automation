import * as path from 'path';

import { Core } from '@go-automation/go-common';

/** Config file structure for ignore patterns */
interface IgnorePatternsConfig {
  readonly ignorePatterns?: ReadonlyArray<string>;
}

// ============================================================================
// Private Helpers
// ============================================================================

/** Default ignore patterns used when no config file exists */
const DEFAULT_IGNORE_PATTERNS: ReadonlyArray<string> = [
  '-CumulativeAlarm',
  'workday-SLAViolations-',
  'autoscaling-rest',
  '-DLQ-IncreasingMessage',
  '-DLQ-HasMessage',
  'pn-paper-channel-autoscaling-custom',
  'pn-radd-SSL-Certificate-Expiration-Alarm',
  'pn-web-logout-api-ErrorAlarm',
  'pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm',
  'redshift-interop-analytics',
] as const;

/**
 * Load ignore patterns from config file using GOJSONFileImporter
 * Falls back to default patterns if file doesn't exist or is invalid
 *
 * @returns Ignore patterns from config file or defaults
 */
export async function loadIgnorePatterns(): Promise<ReadonlyArray<string>> {
  const configPath = path.join(import.meta.dirname, '../configs/ignore-patterns.json');

  const importer = new Core.GOJSONFileImporter<IgnorePatternsConfig>({ inputPath: configPath, optional: true });
  const config = await importer.import();

  const patterns = config?.ignorePatterns;
  if (patterns && patterns.length > 0) {
    return patterns;
  }

  return DEFAULT_IGNORE_PATTERNS;
}
