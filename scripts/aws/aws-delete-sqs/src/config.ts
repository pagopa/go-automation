/**
 * AWS Delete SQS - Configuration Module
 *
 * Defines metadata and CLI parameters for the SQS deletion script.
 */

import { type GOConfigParameterOptions, GOConfigParameterType, type GOScriptMetadata } from '@go-automation/go-script';

/**
 * Script metadata.
 */
export const scriptMetadata: GOScriptMetadata = {
  name: 'AWS Delete SQS',
  version: '1.0.0',
  description: 'Deletes SQS messages - Deletes messages from a SQS queue selectively or entirely.',
  authors: ['Team GO - Gestione Operativa'],
  keywords: ['aws', 'sqs', 'delete'],
};

/**
 * Script parameter definitions.
 */
export const scriptParameters: ReadonlyArray<GOConfigParameterOptions> = [
  {
    name: 'aws.profile',
    aliases: ['ap'],
    type: GOConfigParameterType.STRING,
    description: 'AWS Profile for SSO login',
    required: true,
  },
  {
    name: 'queue.name',
    aliases: ['qn'],
    type: GOConfigParameterType.STRING,
    description: 'Name of the SQS queue',
  },
  {
    name: 'queue.url',
    aliases: ['qu', 'url'],
    type: GOConfigParameterType.STRING,
    description: 'Full URL of the SQS queue (overrides queue-name)',
  },
  {
    name: 'input.file',
    aliases: ['f', 'input'],
    type: GOConfigParameterType.STRING,
    description: 'Input NDJSON file containing messages to delete',
  },
  {
    name: 'purge.all',
    aliases: ['purge'],
    type: GOConfigParameterType.BOOL,
    description: 'Delete ALL messages in the queue',
    defaultValue: false,
  },
  {
    name: 'visibility.timeout',
    aliases: ['vt'],
    type: GOConfigParameterType.INT,
    description: 'Initial visibility timeout in seconds',
    defaultValue: 30,
  },
  {
    name: 'batch.size',
    aliases: ['bs'],
    type: GOConfigParameterType.INT,
    description: 'Number of messages to process in parallel (max 10)',
    defaultValue: 10,
  },
  {
    name: 'max.empty.receives',
    aliases: ['mer'],
    type: GOConfigParameterType.INT,
    description: 'Number of empty receives before considering the queue empty',
    defaultValue: 3,
  },
];
