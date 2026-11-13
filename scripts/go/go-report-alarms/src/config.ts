/**
 * GO Report Alarms - Configuration Module
 *
 * Contains script metadata, parameters definition, configuration interface,
 * and configuration builder function.
 */

import { type GOConfigParameterOptions, GOConfigParameterType, type GOScriptMetadata } from '@go-automation/go-script';

import { loadIgnorePatterns } from './libs/PatternsUtils.js';

/**
 * Script metadata
 */
export const scriptMetadata: GOScriptMetadata = {
  name: 'GO Report Alarms',
  version: '2.0.0',
  description: 'Analizza gli allarmi CloudWatch per i prodotti del team GO (supporto multi-account)',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<GOConfigParameterOptions> = [
  {
    name: 'start.date',
    type: GOConfigParameterType.STRING,
    description: 'Start date for alarm history (ISO 8601 format: yyyy-mm-ddTHH:MM:SSZ)',
    required: true,
    aliases: ['sd'],
  },
  {
    name: 'end.date',
    type: GOConfigParameterType.STRING,
    description: 'End date for alarm history (ISO 8601 format: yyyy-mm-ddTHH:MM:SSZ)',
    required: true,
    aliases: ['ed'],
  },
  {
    name: 'alarm.name',
    type: GOConfigParameterType.STRING,
    description: 'Optional alarm name filter',
    required: false,
    aliases: ['an'],
  },
  {
    name: 'verbose',
    type: GOConfigParameterType.BOOL,
    description: 'Enable verbose output',
    required: false,
    aliases: ['v'],
    defaultValue: false,
  },
  {
    name: 'ignore.patterns',
    type: GOConfigParameterType.STRING_ARRAY,
    description: 'Comma-separated list of ignore patterns',
    required: false,
    aliases: ['ip'],
    asyncFallback: loadIgnorePatterns,
  },
  {
    name: 'aws.profiles',
    type: GOConfigParameterType.STRING_ARRAY,
    description: 'AWS SSO profile names for multi-account mode (comma-separated)',
    required: false,
    aliases: ['aps'],
  },
] as const;
