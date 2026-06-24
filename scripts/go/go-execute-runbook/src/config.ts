import { Core } from '@go-automation/go-common';

export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'Go Execute Runbook',
  version: '1.0.0',
  description: 'Executes one fenced automatic Watchtower runbook lifecycle.',
  authors: ['Team GO - Gestione Operativa'],
};

export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'alarm.event.id',
    type: Core.GOConfigParameterType.STRING,
    description: 'Watchtower alarm event UUID',
    required: false,
  },
  {
    name: 'execution.id',
    type: Core.GOConfigParameterType.STRING,
    description: 'Automatic runbook execution UUID',
    required: false,
  },
  {
    name: 'aws.profiles',
    type: Core.GOConfigParameterType.STRING_ARRAY,
    description: 'AWS SSO profile names for local multi-account runbook execution (comma-separated)',
    required: false,
    aliases: ['aps'],
  },
  {
    name: 'aws.region',
    type: Core.GOConfigParameterType.STRING,
    description: 'AWS region for local AWS clients',
    required: false,
    defaultValue: 'eu-south-1',
    aliases: ['ar'],
  },
  {
    name: 'watchtower.url',
    type: Core.GOConfigParameterType.STRING,
    description: 'Watchtower internal TLS endpoint',
    required: true,
  },
  {
    name: 'watchtower.service.id',
    type: Core.GOConfigParameterType.STRING,
    description: 'Watchtower service principal id',
    required: true,
    defaultValue: 'runbook-automation-worker',
  },
  {
    name: 'watchtower.password',
    type: Core.GOConfigParameterType.STRING,
    description: 'Watchtower service principal password (local only)',
    required: false,
    sensitive: true,
  },
  {
    name: 'watchtower.service.secret.arn',
    type: Core.GOConfigParameterType.STRING,
    description: 'Secrets Manager ARN containing the service principal password',
    required: false,
    sensitive: true,
  },
] as const;
