/**
 * GO Publish Runbook - Configuration Module
 *
 * Contains script metadata, parameters definition, configuration interface,
 * and configuration builder function.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'GO Publish Runbook',
  version: '1.0.0',
  description: 'Pubblica un runbook in formato Markdown su Confluence Cloud convertendolo in ADF',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'input.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Percorso del file JSON contenente il payload del runbook',
    required: true,
    aliases: ['i'],
  },
  {
    name: 'confluence.base.url',
    type: Core.GOConfigParameterType.STRING,
    description: 'URL base di Confluence (es. https://tuo-dominio.atlassian.net/wiki)',
    required: true,
    aliases: ['url'],
  },
  {
    name: 'confluence.email',
    type: Core.GOConfigParameterType.STRING,
    description: "Email dell'utente Atlassian",
    required: true,
    aliases: ['e'],
  },
  {
    name: 'confluence.api.token',
    type: Core.GOConfigParameterType.STRING,
    description: 'Token API di Atlassian',
    required: true,
    aliases: ['t'],
    sensitive: true,
  },
] as const;

/**
 * Script configuration interface
 * Represents all validated configuration parameters for go-publish-runbook
 */
export interface GoPublishRunbookConfig {
  /** Percorso del file JSON contenente il payload del runbook */
  readonly inputFile: string;

  /** URL base di Confluence */
  readonly confluenceBaseUrl: string;

  /** Email dell'utente Atlassian */
  readonly confluenceEmail: string;

  /** Token API di Atlassian */
  readonly confluenceApiToken: string;
}
