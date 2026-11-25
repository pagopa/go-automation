/**
 * Send Sync Anagrafica - Configuration Module
 *
 * Contains script metadata and parameters definition.
 */

import {
  type GOConfigParameterOptions,
  GOConfigParameterType,
  type GOScriptMetadata,
  yesParameter,
} from '@go-automation/go-script';

/**
 * Script metadata
 */
export const scriptMetadata: GOScriptMetadata = {
  name: 'Send Sync Anagrafica',
  version: '2.0.0',
  description: 'Compares the anagrafica tables against pn-configuration and syncs the drift',
  authors: ['Team GO - Gestione Operativa'],
  keywords: ['send', 'anagrafica', 'dynamodb', 'drift', 'sync', 'configuration'],
};

/**
 * Script parameter definitions
 *
 * Aliases are initialisms, never whole words: an alias is resolved against
 * every provider and `GOEnvironmentConfigProvider` loads the whole of
 * `process.env`, so a word-shaped alias silently picks up an unrelated
 * exported variable. The `Resources` group carries no alias at all.
 *
 * The `Resources` parameters are shipped in `configs/config.json` and declared
 * `required: false` on purpose: go-cli's pre-flight check reads only the
 * command line, so a `required: true` parameter that the config file satisfies
 * is reported missing and the run never starts. `assertResourcesConfigured`
 * enforces them once the configuration has been loaded.
 */
export const scriptParameters: ReadonlyArray<GOConfigParameterOptions> = [
  {
    name: 'config.path',
    type: GOConfigParameterType.STRING,
    description: 'Local checkout of pn-configuration, on the branch to compare',
    required: true,
    aliases: ['cp'],
  },
  {
    name: 'env',
    type: GOConfigParameterType.STRING,
    description: 'Environment to compare: test | uat | hotfix | prod',
    required: true,
    aliases: ['ev'],
  },
  {
    name: 'aws.profiles',
    type: GOConfigParameterType.STRING_ARRAY,
    description: 'AWS SSO profiles of both accounts, comma-separated. Each table is routed to its owner',
    required: true,
    aliases: ['aps'],
  },
  {
    name: 'aws.region',
    type: GOConfigParameterType.STRING,
    description: 'AWS region holding the tables',
    required: false,
    aliases: ['ar'],
    defaultValue: 'eu-south-1',
  },
  {
    name: 'table.names',
    type: GOConfigParameterType.STRING_ARRAY,
    description: 'Restricts the run to these tables, comma-separated. Default: every declared table',
    required: false,
    aliases: ['tn'],
    defaultValue: [],
  },
  {
    name: 'sync',
    type: GOConfigParameterType.BOOL,
    description: 'Writes the drift back to DynamoDB. Off by default: without it the run only reports',
    required: false,
    aliases: ['sy'],
    defaultValue: false,
  },
  {
    name: 'strict.configuration',
    type: GOConfigParameterType.BOOL,
    description:
      'Fail the run when a table has no file, or a file has no table map entry. Off by default: two tables are declared with no file in any environment, so a full run would always exit 1. They are reported either way',
    required: false,
    defaultValue: false,
    aliases: ['stc'],
  },
  {
    name: 'dry.run',
    type: GOConfigParameterType.BOOL,
    description:
      'Previews --sync: shows the writes it would send and sends none. The comparison half is read-only either way',
    required: false,
    aliases: ['dr', 'GO_DRY_RUN'],
    defaultValue: false,
  },
  yesParameter('Skips the confirmation that covers every planned write'),
  {
    name: 'output.file',
    type: GOConfigParameterType.STRING,
    description: 'Report path. Only the report lists every differing item',
    required: false,
    aliases: ['of'],
  },
  {
    name: 'output.format',
    type: GOConfigParameterType.STRING,
    description: 'Report format',
    required: false,
    aliases: ['ofm'],
    defaultValue: 'json',
  },
  {
    name: 'accounts.core',
    type: GOConfigParameterType.STRING,
    description: 'Profile-name fragment marking the core account. Shipped in configs/config.json',
    required: false,
    group: 'Resources',
  },
  {
    name: 'accounts.confinfo',
    type: GOConfigParameterType.STRING,
    description: 'Profile-name fragment marking the confinfo account. Shipped in configs/config.json',
    required: false,
    group: 'Resources',
  },
  {
    name: 'configuration.confDir',
    type: GOConfigParameterType.STRING,
    description: 'Per-account configuration directory inside an environment. Shipped in configs/config.json',
    required: false,
    group: 'Resources',
  },
  {
    name: 'configuration.dynamodbDir',
    type: GOConfigParameterType.STRING,
    description: 'Table-file directory inside an account. Shipped in configs/config.json',
    required: false,
    group: 'Resources',
  },
  {
    name: 'configuration.tablesFile',
    type: GOConfigParameterType.STRING,
    description: 'File naming the tables, their account and their key schema. Shipped in configs/config.json',
    required: false,
    group: 'Resources',
  },
  {
    name: 'environments.allowed',
    type: GOConfigParameterType.STRING_ARRAY,
    description: 'Environments this script accepts. Shipped in configs/config.json',
    required: false,
    group: 'Resources',
  },
  {
    name: 'guard.prodProfileMarkers',
    type: GOConfigParameterType.STRING_ARRAY,
    description:
      'Extra profile-name fragments marking production, added to the built-in ones: a --sync write through them needs the profile typed back',
    required: false,
    defaultValue: [],
    group: 'Resources',
  },
] as const;
