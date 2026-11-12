/**
 * Interop Analyze Alarms - Configuration Module
 *
 * Contains script metadata and parameters definition.
 */

import { type GOConfigParameterOptions, GOConfigParameterType, type GOScriptMetadata } from '@go-automation/go-script';

/**
 * Script metadata
 */
export const scriptMetadata: GOScriptMetadata = {
  name: 'Interop Analyze Alarms',
  version: '1.0.0',
  description: 'Execute automatic queries for simple alarm analysis.',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<GOConfigParameterOptions> = [
  {
    name: 'aws.profile',
    type: GOConfigParameterType.STRING,
    description: 'AWS SSO profile name',
    required: true,
    aliases: ['ap'],
  },
  {
    name: 'alarmName',
    type: GOConfigParameterType.STRING,
    description:
      'AWS CloudWatch alarm name. If omitted, the script analyzes every INTEROP k8s alarm occurrence found in the range.',
    required: false,
    aliases: ['an'],
  },
  {
    name: 'startDate',
    type: GOConfigParameterType.STRING,
    description: 'Start date in format ISO 8601',
    required: true,
    aliases: ['sd'],
  },
  {
    name: 'endDate',
    type: GOConfigParameterType.STRING,
    description: 'End date in format ISO 8601',
    required: true,
    aliases: ['ed'],
  },
] as const;
