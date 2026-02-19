/**
 * Send Fetch Dynamodb Data - Configuration Module
 *
 * Contains script metadata, parameters definition, and configuration re-export.
 */

import { Core } from '@go-automation/go-common';
/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'Send Fetch Dynamodb Data',
  version: '1.0.0',
  description: 'Queries a DynamoDB table by partition key for a list of PKs read from a text file',
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
    description: 'Input file containing the list of PKs to query',
    required: true,
    aliases: ['input'],
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
    description: 'Output JSON file path for query results',
    required: true,
    aliases: ['output'],
  },
  {
    name: 'output.format',
    type: Core.GOConfigParameterType.STRING,
    description: 'Output format: json (standard JSON array) or ndjson (newline-delimited JSON)',
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
    name: 'table.key',
    type: Core.GOConfigParameterType.STRING,
    description: 'Name of the partition key attribute in the DynamoDB table',
    required: true,
    aliases: ['key'],
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
] as const;
