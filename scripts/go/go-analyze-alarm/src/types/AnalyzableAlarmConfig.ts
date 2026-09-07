import type { GoAnalyzeAlarmConfig } from './GoAnalyzeAlarmConfig.js';

/**
 * Configuration of a run that actually analyses an alarm (`single`, `range`).
 *
 * The CLI parameters are optional so `analysis.mode=stats` can run offline,
 * without an alarm and without AWS profiles. This type is the narrowed shape
 * produced once those values have been validated.
 */
export type AnalyzableAlarmConfig = GoAnalyzeAlarmConfig & {
  readonly alarmName: string;
  readonly alarmDatetime: string;
  readonly awsProfiles: ReadonlyArray<string>;
};
