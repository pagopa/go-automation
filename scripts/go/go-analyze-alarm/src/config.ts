/**
 * Go Analyze Alarm - Configuration Module
 *
 * Contains script metadata, parameters definition, configuration interface,
 * and configuration builder function.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'Go Analyze Alarm',
  version: '1.0.0',
  description:
    'Analyzes an alarm, executes its associated runbook, and determines the correct operational outcome and next action based on collected evidence and known cases.',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'alarm.name',
    type: Core.GOConfigParameterType.STRING,
    description: 'Name of the CloudWatch alarm that triggered',
    required: true,
    aliases: ['an'],
  },
  {
    name: 'alarm.datetime',
    type: Core.GOConfigParameterType.STRING,
    description: 'Timestamp when the alarm triggered (ISO 8601 format, e.g. 2025-10-01T18:55:00Z)',
    required: true,
    aliases: ['ad'],
  },
  {
    name: 'aws.profiles',
    type: Core.GOConfigParameterType.STRING_ARRAY,
    description: 'AWS SSO profile names for multi-account mode (comma-separated)',
    required: true,
    aliases: ['aps'],
  },
] as const;

/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface GoAnalyzeAlarmConfig {
  /** Name of the CloudWatch alarm */
  readonly alarmName: string;
  /** Timestamp when the alarm triggered (ISO 8601) */
  readonly alarmDatetime: string;
  /** AWS SSO profile names */
  readonly awsProfiles: ReadonlyArray<string>;
}
