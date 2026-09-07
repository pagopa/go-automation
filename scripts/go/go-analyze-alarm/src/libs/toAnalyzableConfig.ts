/**
 * Per-mode validation of the CLI inputs.
 *
 * `alarm.name`, `alarm.datetime` and `aws.profiles` are declared optional so
 * `analysis.mode=stats` can run offline; the alarm-analysis modes validate them
 * here instead, keeping the same "missing required parameter" semantics.
 */

import type { AnalyzableAlarmConfig } from '../types/AnalyzableAlarmConfig.js';
import type { GoAnalyzeAlarmConfig } from '../types/GoAnalyzeAlarmConfig.js';

/**
 * Narrows the configuration to a run that analyses an alarm.
 *
 * @param config - Validated script configuration
 * @returns The same configuration, with the alarm inputs guaranteed
 * @throws Error when an input required by `single`/`range` mode is missing
 *
 * @example
 * ```typescript
 * const analyzable = toAnalyzableConfig(config);
 * console.log(analyzable.alarmName); // string, not string | undefined
 * ```
 */
export function toAnalyzableConfig(config: GoAnalyzeAlarmConfig): AnalyzableAlarmConfig {
  const alarmName = requireValue(config.alarmName, 'alarm.name', '--alarm-name');
  const alarmDatetime = requireValue(config.alarmDatetime, 'alarm.datetime', '--alarm-datetime');

  const awsProfiles = (config.awsProfiles ?? []).map((profile) => profile.trim()).filter((profile) => profile !== '');
  if (awsProfiles.length === 0) {
    throw new Error(missingMessage('aws.profiles', '--aws-profiles'));
  }

  return { ...config, alarmName, alarmDatetime, awsProfiles };
}

function requireValue(value: string | undefined, name: string, flag: string): string {
  const normalized = value?.trim();
  if (normalized === undefined || normalized === '') {
    throw new Error(missingMessage(name, flag));
  }
  return normalized;
}

function missingMessage(name: string, flag: string): string {
  return `${name} is required when analysis.mode is "single" or "range" (${flag}). It is not used by analysis.mode=stats.`;
}
