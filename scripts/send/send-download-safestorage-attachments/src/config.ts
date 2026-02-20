/**
 * Send Download Safestorage Attachments - Configuration Module
 *
 * Contains script metadata, parameters definition, configuration interface,
 * and configuration builder function.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'Send Download Safestorage Attachments',
  version: '2.0.0',
  description: 'Download attachments from Safe Storage via AWS S3 (direct bucket access)',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'input.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Path del file di input (lista di URI o file JSONL)',
    required: true,
    aliases: ['i'],
  },
  {
    name: 'input.mode',
    type: Core.GOConfigParameterType.STRING,
    description:
      'Modalità input: "uri-list" (una URI safestorage:// per riga) o "jsonl" (struttura JSON con attachments)',
    required: false,
    defaultValue: 'uri-list',
    aliases: ['m'],
  },
  {
    name: 'aws.profile',
    type: Core.GOConfigParameterType.STRING,
    description: 'AWS SSO profile con accesso al bucket Safe Storage (es. sso_pn-confinfo-prod)',
    required: true,
    aliases: ['p'],
  },
  {
    name: 'file.extensions',
    type: Core.GOConfigParameterType.STRING,
    description:
      'Filtra gli attachment per estensione (lista separata da virgola, es. "pdf,txt"). Se omesso scarica tutto.',
    required: false,
    aliases: ['ext'],
  },
] as const;
