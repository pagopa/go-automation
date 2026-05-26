import { AWS } from '@go-automation/go-common';

import type { SendMonitorAthenaQueryConfig } from '../types/index.js';

export function validateConfig(config: SendMonitorAthenaQueryConfig): void {
  const hasInlineQuery = hasText(config.athenaQuery);
  const hasQueryFile = hasText(config.athenaQueryFile);

  if (hasInlineQuery === hasQueryFile) {
    throw new Error('Provide exactly one of athena.query or athena.query.file');
  }

  const hasSlackToken = hasText(config.slackToken);
  const hasSlackChannel = hasText(config.slackChannel);
  if (hasSlackToken !== hasSlackChannel) {
    throw new Error('slack.token and slack.channel must be provided together');
  }

  const hasLegacyThresholdField = hasText(config.analysisThresholdField);
  const hasLegacyThresholdValue = config.analysisThreshold !== undefined;
  if (hasLegacyThresholdField !== hasLegacyThresholdValue) {
    throw new Error('analysis.threshold.field and analysis.threshold must be provided together');
  }

  AWS.AWSS3Uri.parse(config.athenaOutputLocation);
  if (hasText(config.artifactS3Location)) {
    AWS.AWSS3Uri.parse(config.artifactS3Location);
  }

  if (!['csv', 'json', 'jsonl'].includes(config.outputFormat)) {
    throw new Error('output.format must be one of: csv, json, jsonl');
  }
}

function hasText(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}
