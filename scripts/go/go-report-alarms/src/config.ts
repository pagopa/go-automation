/**
 * GO Report Alarms - Configuration Module
 *
 * Contains script metadata, parameters definition, configuration interface,
 * and configuration builder function.
 */

import { Core } from '@go-automation/go-common';
import { loadIgnorePatterns } from './libs/PatternsUtils.js';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'GO Report Alarms',
  version: '2.0.0',
  description:
    'Analizza gli allarmi CloudWatch per i prodotti del team GO (supporto multi-account)',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'start.date',
    type: Core.GOConfigParameterType.STRING,
    description: 'Start date for alarm history (ISO 8601 format: yyyy-mm-ddTHH:MM:SSZ)',
    required: true,
    aliases: ['sd'],
  },
  {
    name: 'end.date',
    type: Core.GOConfigParameterType.STRING,
    description: 'End date for alarm history (ISO 8601 format: yyyy-mm-ddTHH:MM:SSZ)',
    required: true,
    aliases: ['ed'],
  },
  {
    name: 'alarm.name',
    type: Core.GOConfigParameterType.STRING,
    description: 'Optional alarm name filter',
    required: false,
    aliases: ['an'],
  },
  {
    name: 'verbose',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Enable verbose output',
    required: false,
    aliases: ['v'],
    defaultValue: false,
  },
  {
    name: 'ignore.patterns',
    type: Core.GOConfigParameterType.STRING_ARRAY,
    description: 'Comma-separated list of ignore patterns',
    required: false,
    aliases: ['ip'],
    asyncFallback: loadIgnorePatterns,
  },
  {
    name: 'aws.profiles',
    type: Core.GOConfigParameterType.STRING_ARRAY,
    description: 'AWS SSO profile names for multi-account mode (comma-separated)',
    required: false,
    aliases: ['aps'],
  },
] as const;

/**
 * Script configuration interface
 * Represents all validated configuration parameters for go-report-alarms
 */
export interface GoReportAlarmsConfig {
  /** Start date for alarm history (ISO 8601 format) */
  readonly startDate: string;

  /** End date for alarm history (ISO 8601 format) */
  readonly endDate: string;

  /** Optional alarm name filter */
  readonly alarmName: string | undefined;

  /** Patterns of alarms to ignore */
  readonly ignorePatterns: ReadonlyArray<string>;

  /** Enable verbose output */
  readonly verbose: boolean;

  /** Multiple AWS profile names (for multi-account mode) */
  readonly awsProfiles: ReadonlyArray<string> | undefined;
}
