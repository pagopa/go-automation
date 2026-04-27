/**
 * SEND Query DynamoDB - Configuration Module
 *
 * Contains script metadata, parameters definition, and configuration re-export.
 */

import { Core } from '@go-automation/go-common';
import { FAILURE_MODES, isFailureMode } from './types/index.js';
/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'AWS Query DynamoDB',
  version: '1.0.0',
  description: 'Queries DynamoDB records - Execute partition key lookups and export results in various data formats.',
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
    name: 'input.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Input file containing the list of PKs to query (supports TXT, JSONL, CSV)',
    required: false,
    aliases: ['input'],
  },
  {
    name: 'input.pks',
    type: Core.GOConfigParameterType.STRING_ARRAY,
    description: 'Comma-separated list of partition keys to query directly from command line',
    required: false,
    aliases: ['pks', 'keys'],
  },
  {
    name: 'input.format',
    type: Core.GOConfigParameterType.STRING,
    description: 'Input file format: txt (one PK per line), jsonl (one JSON string per line), csv',
    required: false,
    defaultValue: 'txt',
    aliases: ['if'],
  },
  {
    name: 'csv.column',
    type: Core.GOConfigParameterType.STRING,
    description: 'CSV column name to extract PKs from (default: first column)',
    required: false,
  },
  {
    name: 'csv.delimiter',
    type: Core.GOConfigParameterType.STRING,
    description: 'CSV delimiter character (default: ",")',
    required: false,
    defaultValue: ',',
  },
  {
    name: 'output.file',
    type: Core.GOConfigParameterType.STRING,
    description: 'Output file path for query results',
    required: false,
    aliases: ['output'],
  },
  {
    name: 'output.attributes',
    type: Core.GOConfigParameterType.STRING,
    description: 'Comma-separated list of item attributes to return (if omitted, returns whole item)',
    required: false,
    aliases: ['attributes', 'attrs'],
  },
  {
    name: 'output.format',
    type: Core.GOConfigParameterType.STRING,
    description: 'Output format: dynamo-json, json, ndjson, csv (attrs only), text (attrs only)',
    required: false,
    defaultValue: 'json',
    aliases: ['format'],
  },
  {
    name: 'table.name',
    type: Core.GOConfigParameterType.STRING,
    description: 'Name of the DynamoDB table to query',
    required: true,
    aliases: ['table'],
  },
  {
    name: 'index.name',
    type: Core.GOConfigParameterType.STRING,
    description: 'Optional name of the Global Secondary Index (GSI) or Local Secondary Index (LSI) to query',
    required: false,
    aliases: ['index'],
  },
  {
    name: 'table.key',
    type: Core.GOConfigParameterType.STRING,
    description: 'Name of the partition key attribute in the DynamoDB table',
    required: true,
    aliases: ['key'],
  },
  {
    name: 'table.sort-key',
    type: Core.GOConfigParameterType.STRING,
    description: 'Optional name of the sort key attribute',
    required: false,
    aliases: ['sort-key', 'sk'],
  },
  {
    name: 'table.sort-value',
    type: Core.GOConfigParameterType.STRING,
    description: 'Optional value for the sort key (required if sort-key is specified)',
    required: false,
    aliases: ['sort-value', 'sv'],
  },
  {
    name: 'key.prefix',
    type: Core.GOConfigParameterType.STRING,
    description: 'Optional prefix to prepend to each PK value before querying',
    required: false,
    aliases: ['prefix'],
  },
  {
    name: 'key.suffix',
    type: Core.GOConfigParameterType.STRING,
    description: 'Optional suffix to append to each PK value before querying',
    required: false,
    aliases: ['suffix'],
  },
  {
    name: 'dry.run',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Preview mode: reads input and shows PKs with prefix/suffix without querying DynamoDB',
    required: false,
    defaultValue: false,
    aliases: ['dry'],
  },
  {
    name: 'failure.mode',
    type: Core.GOConfigParameterType.STRING,
    description:
      'Failure handling policy: abort stops at the first failed query; report completes all queries and exits non-zero on failures; ignore completes all queries and exits zero even on failures',
    required: false,
    defaultValue: 'report',
    aliases: ['fm'],
    validator: (value) =>
      isFailureMode(String(value)) ?? `Invalid failure mode "${String(value)}". Valid: ${FAILURE_MODES.join(', ')}`,
  },
] as const;
