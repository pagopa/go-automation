/**
 * AWS Put SQS - Configuration Module
 *
 * Contains script metadata and parameter definitions for sending messages to SQS.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'AWS Put SQS',
  version: '1.0.0',
  description: 'Puts SQS messages - Inserts messages into a SQS queue from a NDJSON file source.',
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
    name: 'queue.url',
    type: Core.GOConfigParameterType.STRING,
    description: 'Target SQS queue URL',
    required: false,
    aliases: ['qu', 'url'],
  },
  {
    name: 'queue.name',
    type: Core.GOConfigParameterType.STRING,
    description: 'Target SQS queue name',
    required: false,
    aliases: ['qn'],
  },
  {
    name: 'input.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Path to the source file containing messages',
    required: true,
    aliases: ['f', 'input'],
  },
  {
    name: 'file.format',
    type: Core.GOConfigParameterType.STRING,
    description: 'Format of the input file (text, json, csv)',
    defaultValue: 'auto',
    aliases: ['ff'],
  },
  {
    name: 'csv.column',
    type: Core.GOConfigParameterType.STRING,
    description: 'Column name in CSV file containing the message body',
    defaultValue: 'message',
    aliases: ['cc'],
  },
  {
    name: 'delay.seconds',
    type: Core.GOConfigParameterType.INT,
    description: 'Delay in seconds for message visibility (0-900)',
    defaultValue: 0,
    aliases: ['ds', 'delay', 'visibility.timeout'],
  },
  {
    name: 'batch.size',
    type: Core.GOConfigParameterType.INT,
    description: 'Max messages per batch (1-10)',
    defaultValue: 10,
    aliases: ['bs'],
  },
  {
    name: 'batch.max.retries',
    type: Core.GOConfigParameterType.INT,
    description: 'Max retries for failed messages in a batch',
    defaultValue: 3,
    aliases: ['mr'],
  },
  {
    name: 'fifo.group.id',
    type: Core.GOConfigParameterType.STRING,
    description: 'Message Group ID for FIFO queues',
    aliases: ['fgid'],
  },
  {
    name: 'fifo.deduplication.strategy',
    type: Core.GOConfigParameterType.STRING,
    description: 'Strategy for FIFO deduplication (content, hash)',
    defaultValue: 'content',
    aliases: ['fds'],
  },
] as const;
