import { Core } from '@go-automation/go-common';

import { MAX_BATCH_SIZE, MAX_VISIBILITY_TIMEOUT_SECONDS, positiveIntegerValidator } from './libs/validators.js';

export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'AWS Redrive SQS',
  version: '1.0.0',
  description: 'Redrives SQS messages - Moves messages from a source queue to a target queue.',
  authors: ['Team GO - Gestione Operativa'],
};

export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'aws.profile',
    type: Core.GOConfigParameterType.STRING,
    description: 'AWS SSO profile name',
    required: true,
    aliases: ['ap'],
  },
  {
    name: 'source.queue',
    type: Core.GOConfigParameterType.STRING,
    description: 'Source SQS queue name or URL',
    required: true,
    aliases: ['sq', 'src'],
  },
  {
    name: 'target.queue',
    type: Core.GOConfigParameterType.STRING,
    description: 'Target SQS queue name or URL',
    required: true,
    aliases: ['tq', 'dst'],
  },
  {
    name: 'limit',
    type: Core.GOConfigParameterType.INT,
    description: 'Max messages to move',
    required: false,
    aliases: ['lm'],
    validator: positiveIntegerValidator('--limit'),
  },
  {
    name: 'dry.run',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Simulate the move without actual sending/deleting',
    defaultValue: false,
    aliases: ['dr'],
  },
  {
    name: 'visibility.timeout',
    type: Core.GOConfigParameterType.INT,
    description: `Visibility timeout for received messages (0-${String(MAX_VISIBILITY_TIMEOUT_SECONDS)} seconds)`,
    defaultValue: 60,
    aliases: ['vt'],
    validator: (value) =>
      typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_VISIBILITY_TIMEOUT_SECONDS
        ? true
        : `Invalid --visibility-timeout: ${String(value)}. Must be an integer 0-${String(MAX_VISIBILITY_TIMEOUT_SECONDS)} seconds (SQS hard limit).`,
  },
  {
    name: 'batch.size',
    type: Core.GOConfigParameterType.INT,
    description: `Batch size for SQS operations (1-${String(MAX_BATCH_SIZE)})`,
    defaultValue: 10,
    aliases: ['bs'],
    validator: (value) =>
      typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_BATCH_SIZE
        ? true
        : `Invalid --batch-size: ${String(value)}. Must be an integer 1-${String(MAX_BATCH_SIZE)} (SQS hard limit).`,
  },
  {
    name: 'max.empty.receives',
    type: Core.GOConfigParameterType.INT,
    description: 'Stop after this many consecutive empty polls (with 20s long-poll, total wind-down ≈ value × 20s)',
    defaultValue: 3,
    aliases: ['mer'],
    validator: positiveIntegerValidator('--max-empty-receives'),
  },
  {
    name: 'concurrency',
    type: Core.GOConfigParameterType.INT,
    description:
      'Number of parallel receive→send→delete worker pipelines (default 1, sequential). Note: with >1, --limit becomes approximate.',
    defaultValue: 1,
    aliases: ['cc'],
    validator: positiveIntegerValidator('--concurrency'),
  },
] as const;
