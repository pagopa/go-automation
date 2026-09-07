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
    name: 'analysis.mode',
    type: Core.GOConfigParameterType.STRING,
    description:
      'Analysis mode: "single" occurrence, "range" of occurrences for the configured alarm, ' +
      'or "stats" for offline statistics of the local runbook catalog',
    required: false,
    defaultValue: 'single',
    aliases: ['am'],
    validator: (value) =>
      value === 'single' || value === 'range' || value === 'stats' || 'Expected single, range or stats',
  },
  {
    name: 'alarm.name',
    type: Core.GOConfigParameterType.STRING,
    description: 'Name of the CloudWatch alarm that triggered (required unless analysis.mode=stats)',
    required: false,
    aliases: ['an'],
  },
  {
    name: 'alarm.datetime',
    type: Core.GOConfigParameterType.STRING,
    description:
      'Timestamp when the alarm triggered, or first occurrence for multi-occurrence ' +
      'alarms (ISO 8601 format, e.g. 2025-10-01T18:55:00Z). Required unless analysis.mode=stats',
    required: false,
    aliases: ['ad'],
  },
  {
    // Dot-separated segments (not kebab) so `parameterNameToPropertyName`
    // resolves the param to `alarmDatetimeEnd` — the splitter in
    // `GOScript` only camel-cases on `.` separators (a `-` would leave a
    // dash in the property name and `config.alarmDatetimeEnd` would stay
    // `undefined`). The CLI flag stays `--alarm-datetime-end`.
    name: 'alarm.datetime.end',
    type: Core.GOConfigParameterType.STRING,
    description:
      'Optional timestamp of the last occurrence for multi-occurrence alarms ' +
      '(ISO 8601). When provided, the analysis window spans first→last padded ' +
      'on each side by the time window declared by the runbook.',
    required: false,
    aliases: ['ade'],
  },
  {
    name: 'aws.profiles',
    type: Core.GOConfigParameterType.STRING_ARRAY,
    description:
      'AWS SSO profile names for multi-account mode (comma-separated). ' +
      'Required unless analysis.mode=stats, which runs fully offline',
    required: false,
    aliases: ['aps'],
  },
  {
    name: 'stats.detail',
    type: Core.GOConfigParameterType.BOOL,
    description: 'In stats mode, print the per-runbook detail table',
    required: false,
    defaultValue: true,
    aliases: ['sdt'],
  },
  {
    name: 'stats.save',
    type: Core.GOConfigParameterType.BOOL,
    description: 'In stats mode, save the report as runbook-stats.json in the output directory',
    required: false,
    defaultValue: false,
    aliases: ['ssv'],
  },
  {
    name: 'stats.product',
    type: Core.GOConfigParameterType.STRING,
    description: 'In stats mode, restrict the report to a single product (e.g. SEND, INTEROP)',
    required: false,
    aliases: ['spr'],
  },
] as const;
