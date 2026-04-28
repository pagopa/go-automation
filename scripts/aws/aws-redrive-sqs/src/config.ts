import { Core } from '@go-automation/go-common';

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
    aliases: ['l'],
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
    description: 'Visibility timeout for received messages (seconds)',
    defaultValue: 60,
    aliases: ['vt'],
  },
  {
    name: 'batch.size',
    type: Core.GOConfigParameterType.INT,
    description: 'Batch size for SQS operations (1-10)',
    defaultValue: 10,
    aliases: ['bs'],
  },
] as const;
