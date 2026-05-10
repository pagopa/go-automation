/**
 * Go Search Jira - Configuration Module
 *
 * Contains script metadata and parameter definitions consumed by GOScript.
 *
 * Note on `jira.token`: the parameter holds the token value itself. Resolution
 * across env / CLI / config file is delegated to GOConfig, which automatically
 * maps `jira.token` to the `JIRA_TOKEN` environment variable. The parameter is
 * marked `sensitive: true` so its value is redacted in the configuration
 * summary and never appears in logs.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'Go Search Jira',
  version: '1.0.0',
  description: 'Indicizza e cerca testo dentro gli attachment delle card Jira Cloud, in autonomia per il team',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  // ── action ──────────────────────────────────────────────────────────
  {
    name: 'action',
    type: Core.GOConfigParameterType.STRING,
    description: 'Sub-command to execute: sync | search | status | clean',
    required: true,
    aliases: ['ac'],
  },

  // ── jira ────────────────────────────────────────────────────────────
  {
    name: 'jira.url',
    type: Core.GOConfigParameterType.STRING,
    description: 'Base URL of the Jira Cloud instance (e.g. https://example.atlassian.net)',
    defaultValue: '',
    required: false,
  },
  {
    name: 'jira.email',
    type: Core.GOConfigParameterType.STRING,
    description: 'Email associated with the Jira API token (required for basic auth on Jira Cloud)',
    defaultValue: '',
    required: false,
  },
  {
    name: 'jira.token',
    type: Core.GOConfigParameterType.STRING,
    description:
      'Jira API token. Auto-resolved from the JIRA_TOKEN env var by GOConfig; can also be set via --jira-token. Redacted in logs.',
    defaultValue: '',
    required: false,
    sensitive: true,
  },
  {
    name: 'jira.auth.mode',
    type: Core.GOConfigParameterType.STRING,
    description: 'Authentication mode: basic (Cloud, default) or bearer (Data Center)',
    defaultValue: 'basic',
    required: false,
  },
  {
    name: 'jira.jql',
    type: Core.GOConfigParameterType.STRING,
    description: 'JQL used by the `sync` action to discover issues',
    defaultValue: '',
    required: false,
  },
  {
    name: 'jira.issue.keys',
    type: Core.GOConfigParameterType.STRING_ARRAY,
    description: 'Explicit list of issue keys to sync (alternative to --jira-jql)',
    defaultValue: [],
    required: false,
  },

  // ── sync ────────────────────────────────────────────────────────────
  {
    name: 'sync.max.parallel.downloads',
    type: Core.GOConfigParameterType.INT,
    description: 'Maximum concurrent attachment downloads',
    defaultValue: 5,
    required: false,
  },
  {
    name: 'sync.max.attachment.size.mb',
    type: Core.GOConfigParameterType.INT,
    description: 'Skip attachments larger than this size (MB)',
    defaultValue: 500,
    required: false,
  },
  {
    name: 'sync.keep.raw',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Keep raw downloaded files after extraction (default: false, deleted for privacy)',
    defaultValue: false,
    required: false,
  },
  {
    name: 'sync.dry.run',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Plan the sync without downloading or indexing anything',
    defaultValue: false,
    required: false,
  },
  {
    name: 'sync.force',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Re-download and re-index attachments already present',
    defaultValue: false,
    required: false,
  },

  // ── search ──────────────────────────────────────────────────────────
  {
    name: 'search.query',
    type: Core.GOConfigParameterType.STRING,
    description: 'Search query (search action)',
    defaultValue: '',
    required: false,
    aliases: ['q'],
  },
  {
    name: 'search.mode',
    type: Core.GOConfigParameterType.STRING,
    description: 'Search mode: full-text (default, BM25) or literal (case-insensitive substring)',
    defaultValue: 'full-text',
    required: false,
  },
  {
    name: 'search.limit',
    type: Core.GOConfigParameterType.INT,
    description: 'Maximum number of search results',
    defaultValue: 20,
    required: false,
  },
  {
    name: 'search.project',
    type: Core.GOConfigParameterType.STRING,
    description: 'Filter results by Jira project key',
    defaultValue: '',
    required: false,
  },

  // ── output ──────────────────────────────────────────────────────────
  {
    name: 'output.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Output file path (absolute, or filename relative to the output directory)',
    defaultValue: '',
    required: false,
    aliases: ['of'],
  },
  {
    name: 'output.format',
    type: Core.GOConfigParameterType.STRING,
    description: `Output format for the search action: ${Core.GO_EXPORT_FORMATS.join(' | ')} (default: json)`,
    required: false,
    aliases: ['ff'],
    defaultValue: 'json',
    validator: (value) =>
      Core.isGOExportFormat(String(value)) ||
      `Invalid format "${String(value)}". Valid: ${Core.GO_EXPORT_FORMATS.join(', ')}`,
  },

  // ── clean ───────────────────────────────────────────────────────────
  {
    name: 'clean.raw.only',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Only purge cached raw files; keep the search index',
    defaultValue: false,
    required: false,
  },
  {
    name: 'clean.yes',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Skip the interactive confirmation prompt for the clean action',
    defaultValue: false,
    required: false,
  },

  // ── storage ─────────────────────────────────────────────────────────
  {
    name: 'storage.data.dir',
    type: Core.GOConfigParameterType.STRING,
    description:
      'Directory hosting index.db and cached attachments. Defaults to the script output dir resolved by GOPaths.',
    defaultValue: '',
    required: false,
  },
  {
    name: 'storage.index.file.name',
    type: Core.GOConfigParameterType.STRING,
    description: 'File name of the SQLite index inside storage.data.dir',
    defaultValue: 'index.db',
    required: false,
  },
] as const;
