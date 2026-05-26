/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
import type { ReportFormat } from './ReportFormat.js';

export interface SendMonitorAthenaQueryConfig {
  readonly from?: string;
  readonly to?: string;
  readonly timeLookbackHours: number;
  readonly timeZone: string;
  readonly awsProfile?: string;
  readonly awsRegion: string;
  readonly athenaDatabase: string;
  readonly athenaCatalog: string;
  readonly athenaWorkgroup: string;
  readonly athenaOutputLocation: string;
  readonly athenaQuery?: string;
  readonly athenaQueryFile?: string;
  readonly athenaMaxPollAttempts: number;
  readonly athenaPollIntervalMs: number;
  readonly templateParams: ReadonlyArray<string>;
  readonly templateRaw: ReadonlyArray<string>;
  readonly templateLegacyAliases: boolean;
  readonly outputFolder: string;
  readonly outputFormat: ReportFormat;
  readonly outputFilePrefix: string;
  readonly outputAttachWhenEmpty: boolean;
  readonly artifactS3Location?: string;
  readonly slackToken?: string;
  readonly slackChannel?: string;
  readonly slackMessageTemplate: string;
  readonly slackSendOnEmpty: boolean;
  readonly slackSendOnError: boolean;
  readonly analysisRules: ReadonlyArray<string>;
  readonly analysisThresholdField?: string;
  readonly analysisThreshold?: number;
}
