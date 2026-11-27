import { type GOConfigParameterOptions, GOConfigParameterType, type GOScriptMetadata } from '@go-automation/go-script';
/**
 * Go Report Error Patterns - Configuration Module
 *
 * Contains script metadata and parameters definition.
 */

/**
 * Script metadata
 */
export const scriptMetadata: GOScriptMetadata = {
  name: 'Go Report Error Patterns',
  version: '1.0.0',
  description:
    "Genera un report sui pattern di errore nei log di AWS CloudWatch correlati all'attivazione degli allarmi.",
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
    required: false,
    aliases: ['aps'],
  },
  {
    name: 'config.file',
    type: GOConfigParameterType.STRING,
    description: 'Path to configuration JSON file',
    required: true,
    aliases: ['f', 'cf'],
  },
] as const;
