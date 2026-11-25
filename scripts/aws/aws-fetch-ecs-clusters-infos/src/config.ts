/**
 * Send Fetch Ecs Clusters Infos - Configuration Module
 *
 * Contains script metadata and parameters definition.
 */

import { type GOConfigParameterOptions, GOConfigParameterType, type GOScriptMetadata } from '@go-automation/go-script';

/**
 * Script metadata
 */
export const scriptMetadata: GOScriptMetadata = {
  name: 'Send Fetch Ecs Clusters Infos',
  version: '1.0.0',
  description: 'For each configured environment and cluster, this script retrieves:',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<GOConfigParameterOptions> = [
  {
    name: 'aws.profiles',
    type: GOConfigParameterType.STRING_ARRAY,
    description: 'AWS SSO profile names',
    required: true,
    aliases: ['aps'],
  },
  {
    name: 'config.file',
    type: GOConfigParameterType.STRING,
    description: 'Configuration file',
    required: true,
    aliases: ['f'],
  },
] as const;
