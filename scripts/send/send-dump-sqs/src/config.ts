/**
 * SEND Dump SQS - Configuration Module
 *
 * Contains script metadata, parameters definition, and configuration interface.
 */

import { Core } from '@go-automation/go-common';

/**
 * Supported deduplication modes
 */
export enum SendDumpSqsDedupMode {
  /** Filter technical duplicates (same SQS message ID) */
  MESSAGE_ID = 'message-id',

  /** Filter content duplicates (same MD5 hash of Body + MessageAttributes) */
  CONTENT_MD5 = 'content-md5',

  /** No deduplication, dump everything as received */
  NONE = 'none',
}

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'SEND Dump SQS',
  version: '1.1.0',
  description: 'Read-only dump of all messages from an SQS queue in NDJSON format.',
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
    name: 'queue.name',
    type: Core.GOConfigParameterType.STRING,
    description: 'Target SQS queue name',
    required: true,
    aliases: ['qn'],
  },
  {
    name: 'visibility.timeout',
    type: Core.GOConfigParameterType.INT,
    description: 'Visibility timeout for received messages in seconds (default: 60)',
    required: false,
    aliases: ['vt'],
    defaultValue: 60,
  },
  {
    name: 'limit',
    type: Core.GOConfigParameterType.INT,
    description: 'Maximum number of messages to dump',
    required: false,
    aliases: ['l'],
  },
  {
    name: 'dedup.mode',
    type: Core.GOConfigParameterType.STRING,
    description: 'Deduplication mode (message-id, content-md5, none) (default: message-id)',
    required: false,
    aliases: ['dm'],
    defaultValue: SendDumpSqsDedupMode.MESSAGE_ID,
  },
  {
    name: 'max.empty.receives',
    type: Core.GOConfigParameterType.INT,
    description: 'Number of consecutive empty polls before stopping (default: 3)',
    required: false,
    aliases: ['mer'],
    defaultValue: 3,
  },
  {
    name: 'output.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Custom output file path (relative to project root or absolute)',
    required: false,
    aliases: ['o'],
  },
] as const;

/**
 * Script configuration interface
 */
export interface SendDumpSqsConfig {
  /** AWS SSO profile name */
  readonly awsProfile: string;

  /** Target SQS queue name */
  readonly queueName: string;

  /** Visibility timeout for received messages */
  readonly visibilityTimeout: number;

  /** Maximum number of messages to dump */
  readonly limit: number | undefined;

  /** Deduplication mode */
  readonly dedupMode: SendDumpSqsDedupMode;

  /** Number of consecutive empty polls before stopping */
  readonly maxEmptyReceives: number;

  /** Custom output file path */
  readonly outputFile: string | undefined;
}
