/**
 * Send Report Dlq - Configuration Module
 *
 * Contains script metadata, parameters definition, configuration interface,
 * and configuration builder function.
 */

import { type GOConfigParameterOptions, GOConfigParameterType, type GOScriptMetadata } from '@go-automation/go-script';

/**
 * Script metadata
 */
export const scriptMetadata: GOScriptMetadata = {
  name: 'Send Report DLQ',
  version: '1.0.0',
  description:
    'Genera un report delle Dead Letter Queue (DLQ) per uno o più ambienti AWS SEND, ' +
    'mostrando il numero di messaggi e la loro età per ogni profilo specificato.',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<GOConfigParameterOptions> = [
  {
    name: 'aws.profiles',
    type: GOConfigParameterType.STRING_ARRAY,
    description: 'AWS SSO profile names for multi-account mode (comma-separated)',
    required: true,
    aliases: ['aps'],
  },
  {
    name: 'output.file',
    type: GOConfigParameterType.STRING,
    description: 'Output file path (absolute, or filename relative to the output directory)',
    required: false,
    aliases: ['of'],
  },
  {
    name: 'output.format',
    type: GOConfigParameterType.STRING,
    description: 'Output format: json | jsonl | csv | html | txt (default: json)',
    required: false,
    aliases: ['ff'],
    defaultValue: 'json',
  },
] as const;
