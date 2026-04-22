/**
 * Send Delete SQS - Configuration Module
 *
 * Defines metadata and CLI parameters for the SQS deletion script.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata.
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'SEND Delete SQS',
  version: '1.0.0',
  description: 'Deletes SQS messages - Removes messages selectively via input file or purges the entire queue.',
  authors: ['Team GO - Gestione Operativa'],
  keywords: ['send', 'sqs', 'delete'],
};

/**
 * Script parameter definitions.
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'aws.profile',
    cliFlag: 'aws-profile',
    aliases: ['ap'],
    type: Core.GOConfigParameterType.STRING,
    description: 'AWS Profile for SSO login',
    required: true,
  },
  {
    name: 'queue.name',
    cliFlag: 'queue-name',
    aliases: ['qn'],
    type: Core.GOConfigParameterType.STRING,
    description: 'Name of the SQS queue',
  },
  {
    name: 'queue.url',
    cliFlag: 'queue-url',
    aliases: ['qu', 'url'],
    type: Core.GOConfigParameterType.STRING,
    description: 'Full URL of the SQS queue (overrides queue-name)',
  },
  {
    name: 'input.file',
    cliFlag: 'input-file',
    aliases: ['f', 'input'],
    type: Core.GOConfigParameterType.STRING,
    description: 'Input NDJSON file containing messages to delete',
  },
  {
    name: 'purge.all',
    cliFlag: 'purge-all',
    aliases: ['purge'],
    type: Core.GOConfigParameterType.BOOL,
    description: 'Delete ALL messages in the queue',
    defaultValue: false,
  },
  {
    name: 'visibility.timeout',
    cliFlag: 'visibility-timeout',
    aliases: ['vt'],
    type: Core.GOConfigParameterType.INT,
    description: 'Initial visibility timeout in seconds',
    defaultValue: 30,
  },
  {
    name: 'batch.size',
    cliFlag: 'batch-size',
    aliases: ['bs'],
    type: Core.GOConfigParameterType.INT,
    description: 'Number of messages to process in parallel (max 10)',
    defaultValue: 10,
  },
  {
    name: 'max.empty.receives',
    cliFlag: 'max-empty-receives',
    aliases: ['mer'],
    type: Core.GOConfigParameterType.INT,
    description: 'Number of empty receives before considering the queue empty',
    defaultValue: 3,
  },
];
