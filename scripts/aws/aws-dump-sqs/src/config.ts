/**
 * AWS Dump SQS - Configuration Module
 *
 * Contains script metadata, parameters definition, and configuration interface.
 */

import { type GOConfigParameterOptions, GOConfigParameterType, type GOScriptMetadata } from '@go-automation/go-script';

/**
 * Script metadata
 */
export const scriptMetadata: GOScriptMetadata = {
  name: 'AWS Dump SQS',
  version: '1.1.0',
  description: 'Dumps SQS messages - Extracts messages from a SQS queue in NDJSON format.',
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
    name: 'queue.name',
    type: GOConfigParameterType.STRING,
    description: 'Target SQS queue name',
    required: false,
    aliases: ['qn'],
  },
  {
    name: 'queue.url',
    type: GOConfigParameterType.STRING,
    description: 'Target SQS queue URL',
    required: false,
    aliases: ['qu', 'url'],
  },
  {
    name: 'visibility.timeout',
    type: GOConfigParameterType.INT,
    description: 'Visibility timeout for received messages in seconds (default: 60)',
    required: false,
    aliases: ['vt'],
    defaultValue: 60,
  },
  {
    name: 'limit',
    type: GOConfigParameterType.INT,
    description: 'Maximum number of messages to dump',
    required: false,
    aliases: ['l'],
  },
  {
    name: 'dedup.mode',
    type: GOConfigParameterType.STRING,
    description: 'Deduplication mode (message-id, content-md5, none) (default: message-id)',
    required: false,
    aliases: ['dm'],
    defaultValue: 'message-id',
  },
  {
    name: 'max.empty.receives',
    type: GOConfigParameterType.INT,
    description: 'Number of consecutive empty polls before stopping (default: 3)',
    required: false,
    aliases: ['mer'],
    defaultValue: 3,
  },
  {
    name: 'output.file',
    type: GOConfigParameterType.STRING,
    description: 'Custom output file path (relative to project root or absolute)',
    required: false,
    aliases: ['o'],
  },
] as const;
