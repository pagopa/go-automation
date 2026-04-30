/**
 * AWS Dump SQS - Configuration Module
 *
 * Defines metadata and CLI parameters for the SQS dump script.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata.
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'AWS Dump SQS',
  version: '1.1.0',
  description: 'Dumps SQS messages - Extracts messages from a SQS queue in NDJSON format.',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions.
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
    name: 'queue.name',
    type: Core.GOConfigParameterType.STRING,
    description: 'Target SQS queue name',
    aliases: ['qn'],
  },
  {
    name: 'queue.url',
    type: Core.GOConfigParameterType.STRING,
    description: 'Target SQS queue URL',
    aliases: ['qu', 'url'],
  },
  {
    name: 'visibility.timeout',
    type: Core.GOConfigParameterType.INT,
    description: 'Visibility timeout for received messages in seconds',
    defaultValue: 60,
    aliases: ['vt'],
  },
  {
    name: 'limit',
    type: Core.GOConfigParameterType.INT,
    description: 'Maximum number of messages to dump',
    aliases: ['l'],
  },
  {
    name: 'dedup.mode',
    type: Core.GOConfigParameterType.STRING,
    description: 'Deduplication mode (message-id, content-md5, none)',
    defaultValue: 'message-id',
    aliases: ['dm'],
  },
  {
    name: 'max.empty.receives',
    type: Core.GOConfigParameterType.INT,
    description: 'Number of consecutive empty polls before stopping',
    defaultValue: 3,
    aliases: ['mer'],
  },
  {
    name: 'output.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Custom output file path (relative to project root or absolute)',
    aliases: ['o'],
  },
] as const;
