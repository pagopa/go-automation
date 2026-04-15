import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'Send Check ECS',
  version: '1.0.0',
  description: 'Checks status of ECS clusters, services and tasks',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'aws.profiles',
    type: Core.GOConfigParameterType.STRING_ARRAY,
    description: 'AWS SSO profile names for multi-account mode (comma-separated)',
    required: true,
    aliases: ['aps'],
  },
  {
    name: 'ecs.clusters',
    type: Core.GOConfigParameterType.STRING_ARRAY,
    description: 'Specific clusters to check. If empty, checks all.',
    required: false,
    aliases: ['c'],
  },
] as const;
