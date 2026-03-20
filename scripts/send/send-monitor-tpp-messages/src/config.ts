/**
 * SEND Monitor TPP Messages - Configuration Module
 *
 * Contains script metadata, parameters definition, and configuration interface.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'SEND Monitor TPP Messages',
  version: '2.0.0',
  description: 'Monitors TPP messages via Athena queries and generates reports with optional Slack notifications',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  // Date range parameters
  {
    name: 'from',
    type: Core.GOConfigParameterType.STRING,
    description: 'Start date/time (ISO 8601, date-only, or Unix timestamp). Defaults to 24 hours ago.',
    required: false,
    aliases: ['f'],
  },
  {
    name: 'to',
    type: Core.GOConfigParameterType.STRING,
    description: 'End date/time (ISO 8601, date-only, or Unix timestamp). Defaults to current time.',
    required: false,
    aliases: ['t'],
  },

  // AWS configuration
  {
    name: 'aws.profile',
    type: Core.GOConfigParameterType.STRING,
    description: 'AWS SSO profile name (e.g., sso_pn-core-prod). Not required in AWS-managed environments.',
    required: false,
    aliases: ['ap'],
  },
  {
    name: 'aws.region',
    type: Core.GOConfigParameterType.STRING,
    description: 'AWS region',
    required: false,
    aliases: ['ar'],
    defaultValue: 'eu-south-1',
  },

  // Athena configuration
  {
    name: 'athena.database',
    type: Core.GOConfigParameterType.STRING,
    description: 'Athena database name',
    required: true,
    aliases: ['ad'],
  },
  {
    name: 'athena.catalog',
    type: Core.GOConfigParameterType.STRING,
    description: 'Athena data catalog',
    required: false,
    aliases: ['ac'],
    defaultValue: 'AwsDataCatalog',
  },
  {
    name: 'athena.workgroup',
    type: Core.GOConfigParameterType.STRING,
    description: 'Athena workgroup',
    required: false,
    aliases: ['aw'],
    defaultValue: 'primary',
  },
  {
    name: 'athena.output.location',
    type: Core.GOConfigParameterType.STRING,
    description: 'S3 output location for Athena query results',
    required: true,
    aliases: ['ao'],
  },
  {
    name: 'athena.max.retries',
    type: Core.GOConfigParameterType.INT,
    description: 'Maximum retries for query status polling',
    required: false,
    aliases: ['amr'],
    defaultValue: 60,
  },
  {
    name: 'athena.retry.delay',
    type: Core.GOConfigParameterType.INT,
    description: 'Delay between retries in milliseconds',
    required: false,
    aliases: ['ard'],
    defaultValue: 5000,
  },
  {
    name: 'athena.query',
    type: Core.GOConfigParameterType.STRING,
    description: 'SQL query template with placeholders ({{startDate}}, {{endDate}}, partition keys, etc.)',
    required: true,
    aliases: ['aq'],
  },

  // Slack configuration (optional)
  {
    name: 'slack.token',
    type: Core.GOConfigParameterType.STRING,
    description: 'Slack bot token for notifications',
    required: false,
    sensitive: true,
    aliases: ['st'],
  },
  {
    name: 'slack.channel',
    type: Core.GOConfigParameterType.STRING,
    description: 'Slack channel ID or name',
    required: false,
    aliases: ['sc'],
  },
  {
    name: 'slack.message.template',
    type: Core.GOConfigParameterType.STRING,
    description: 'Custom Slack message template',
    required: false,
    aliases: ['smt'],
  },

  // Analysis configuration (optional)
  {
    name: 'analysis.threshold.field',
    type: Core.GOConfigParameterType.STRING,
    description: 'Field name to analyze against threshold',
    required: false,
    aliases: ['atf'],
  },
  {
    name: 'analysis.threshold',
    type: Core.GOConfigParameterType.INT,
    description: 'Threshold value for analysis',
    required: false,
    aliases: ['at'],
    defaultValue: 0,
  },

  // Output configuration
  {
    name: 'reports.folder',
    type: Core.GOConfigParameterType.STRING,
    description: 'Output folder for CSV reports',
    required: false,
    aliases: ['rf'],
    defaultValue: 'reports',
  },
] as const;
