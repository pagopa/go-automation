/**
 * GO Prepare Runbook - Configuration Module
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'GO Prepare Runbook',
  version: '1.0.0',
  description: 'Ingestion, merging e validazione dei runbook in Markdown con YAML frontmatter.',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'input-file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Percorso del file Markdown grezzo (.md)',
    required: true,
    aliases: ['i'],
  },
  {
    name: 'shared-assets-dir',
    type: Core.GOConfigParameterType.STRING,
    description: 'Directory contenente gli asset condivisi (JSON/Markdown)',
    required: true,
    aliases: ['s'],
  },
  {
    name: 'output-file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Percorso del file JSON di output',
    required: true,
    aliases: ['o'],
  },
] as const;

/**
 * Script configuration interface
 */
export interface GoPrepareRunbookConfig {
  /** Percorso del file Markdown grezzo */
  readonly 'input-file': string;

  /** Directory degli asset condivisi */
  readonly 'shared-assets-dir': string;

  /** Percorso del file JSON di output */
  readonly 'output-file': string;
}
