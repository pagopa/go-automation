/**
 * Interop Analyze Alarms - Configuration Module
 *
 * Contains script metadata and parameters definition.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'Interop Analyze Alarms',
  version: '1.0.0',
  description: 'Execute automatic queries for simple alarm analysis.',
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
  {
    name: 'alarmName',
    type: Core.GOConfigParameterType.STRING,
    description:
      'AWS CloudWatch alarm name. If omitted, the script analyzes every INTEROP k8s alarm occurrence found in the range.',
    required: false,
    aliases: ['an'],
  },
  {
    name: 'startDate',
    type: Core.GOConfigParameterType.STRING,
    description: 'Start date in format ISO 8601',
    required: true,
    aliases: ['sd'],
  },
  {
    name: 'endDate',
    type: Core.GOConfigParameterType.STRING,
    description: 'End date in format ISO 8601',
    required: true,
    aliases: ['ed'],
  },
] as const;
