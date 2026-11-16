import { type GOConfigParameterOptions, GOConfigParameterType, type GOScriptMetadata } from '@go-automation/go-script';

/**
 * Script metadata
 */
export const scriptMetadata: GOScriptMetadata = {
  name: 'AWS Check ECS',
  version: '1.0.0',
  description: 'Checks ECS status - Verifies health of ECS clusters, services, and tasks.',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<GOConfigParameterOptions> = [
  {
    name: 'aws.profiles',
    type: GOConfigParameterType.STRING_ARRAY,
    description: 'AWS SSO profile names for multi-account mode (comma-separated)',
    required: true,
    aliases: ['aps'],
  },
  {
    name: 'aws.region',
    type: GOConfigParameterType.STRING,
    description: 'AWS region',
    required: false,
    defaultValue: 'eu-south-1',
    aliases: ['ar'],
  },
  {
    name: 'ecs.clusters',
    type: GOConfigParameterType.STRING_ARRAY,
    description: 'Comma-separated list of ECS cluster names or partial names to filter',
    required: false,
    aliases: ['c'],
  },
];
