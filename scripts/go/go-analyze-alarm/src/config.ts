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
    name: 'aws.profile',
    type: Core.GOConfigParameterType.STRING,
    description: 'AWS SSO profile name',
    required: true,
    aliases: ['ap'],
  },
] as const;

/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface GoAnalyzeAlarmConfig {
  /** AWS profile name */
  readonly awsProfile: string;
}
