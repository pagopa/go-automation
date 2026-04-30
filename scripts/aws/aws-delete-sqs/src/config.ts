/**
 * AWS Delete SQS - Configuration Module
 *
 * Defines metadata and CLI parameters for the SQS deletion script.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata.
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'AWS Delete SQS',
  version: '1.0.0',
  description: 'Deletes SQS messages - Deletes messages from a SQS queue selectively or entirely.',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions.
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'aws.profile',
    type: Core.GOConfigParameterType.STRING,
    description: 'AWS Profile for SSO login',
    required: true,
    aliases: ['ap'],
  },
  {
    name: 'queue.name',
    type: Core.GOConfigParameterType.STRING,
    description: 'Name of the SQS queue',
    aliases: ['qn'],
  },
  {
    name: 'queue.url',
    type: Core.GOConfigParameterType.STRING,
    description: 'Full URL of the SQS queue (overrides queue-name)',
    aliases: ['qu', 'url'],
  },
  {
    name: 'input.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Input NDJSON file containing messages to delete',
    aliases: ['f', 'input'],
  },
  {
    name: 'purge.all',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Delete ALL messages in the queue',
    defaultValue: false,
    aliases: ['purge'],
  },
  {
    name: 'visibility.timeout',
    type: Core.GOConfigParameterType.INT,
    description: 'Initial visibility timeout in seconds',
    defaultValue: 30,
    aliases: ['vt'],
  },
  {
    name: 'batch.size',
    type: Core.GOConfigParameterType.INT,
    description: 'Number of messages to process in parallel (max 10)',
    defaultValue: 10,
    aliases: ['bs'],
  },
  {
    name: 'max.empty.receives',
    type: Core.GOConfigParameterType.INT,
    description: 'Number of empty receives before considering the queue empty',
    defaultValue: 3,
    aliases: ['mer'],
  },
] as const;
