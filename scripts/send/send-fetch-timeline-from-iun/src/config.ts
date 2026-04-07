/**
 * Send Fetch Timeline From Iun - Configuration Module
 *
 * Contains script metadata, parameters definition, configuration interface,
 * and configuration builder function.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'Send Fetch Timeline From Iun',
  version: '1.0.0',
  description: 'Reads a list of IUNs from a TXT file and downloads the timelines from DynamoDB, writing to JSON file',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'aws.profile',
    type: Core.GOConfigParameterType.STRING,
    description: 'AWS SSO profile name (e.g., sso_pn-core-prod)',
    required: true,
    aliases: ['ap'],
  },
  {
    name: 'source.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Input TXT file containing IUNs (one per line, optionally with date filter)',
    required: true,
    aliases: ['sf', 'input'],
  },
  {
    name: 'destination.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Output JSON file path for timeline results',
    required: true,
    aliases: ['df', 'output'],
  },
] as const;

