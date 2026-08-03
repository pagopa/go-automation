/**
 * Send Fetch Ecs Clusters Infos - Configuration Module
 *
 * Contains script metadata and parameters definition.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'Send Fetch Ecs Clusters Infos',
  version: '1.0.0',
  description: 'For each configured environment and cluster, this script retrieves:',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'aws.profiles',
    type: Core.GOConfigParameterType.STRING_ARRAY,
    description: 'AWS SSO profile names',
    required: true,
    aliases: ['aps'],
  },
  {
    name: 'configFile',
    type: Core.GOConfigParameterType.STRING,
    description: 'Configuration file',
    required: true,
    aliases: ['f'],
  },
] as const;
