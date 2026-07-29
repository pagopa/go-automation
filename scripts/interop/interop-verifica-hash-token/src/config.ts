/**
 * Interop Verifica Hash Token - Configuration Module
 *
 * Contains script metadata and parameters definition.
 */

import { Core } from '@go-automation/go-common';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'Interop Verifica Hash Token',
  version: '1.0.0',
  description: "Verifica hash dei token per l'allarme interop-be-audit-signer",
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'aws.profile',
    type: Core.GOConfigParameterType.STRING,
    description: 'AWS SSO profile name',
    required: true,
    aliases: ['ap'],
  },
  {
    name: 'aws.region',
    type: Core.GOConfigParameterType.STRING,
    description: 'AWS Region',
    required: false,
    defaultValue: 'eu-south-1',
    aliases: ['ar'],
  },
  {
    name: 'cw.logGroup',
    type: Core.GOConfigParameterType.STRING,
    description: 'CloudWatch Log Group Name',
    required: true,
    aliases: ['lg'],
    envVar: 'CW_LOG_GROUP',
  },
  {
    name: 'cw.queryApplication',
    type: Core.GOConfigParameterType.STRING,
    description: 'CloudWatch Logs query string for application logs',
    required: true,
    aliases: ['qa'],
    envVar: 'CW_QUERY_APPLICATION',
  },
  {
    name: 'cw.queryCid',
    type: Core.GOConfigParameterType.STRING,
    description: 'CloudWatch Logs query string for CID log details',
    required: true,
    aliases: ['qc'],
    envVar: 'CW_QUERY_CID',
  },
  {
    name: 's3.bucketNameNdjson',
    type: Core.GOConfigParameterType.STRING,
    description: 'S3 bucket name for NDJSON tokens',
    required: true,
    aliases: ['bn'],
    envVar: 'S3_BUCKET_NAME_NDJSON',
  },
  {
    name: 's3.prefixNdjson',
    type: Core.GOConfigParameterType.STRING,
    description: 'S3 prefix for NDJSON tokens',
    required: false,
    defaultValue: 'token-details',
    aliases: ['pn'],
    envVar: 'S3_PREFIX_NDJSON',
  },
  {
    name: 's3.bucketNameP7m',
    type: Core.GOConfigParameterType.STRING,
    description: 'S3 bucket name for signed P7M tokens',
    required: true,
    aliases: ['bp'],
    envVar: 'S3_BUCKET_NAME_P7M',
  },
  {
    name: 's3.prefixP7m',
    type: Core.GOConfigParameterType.STRING,
    description: 'S3 prefix for signed P7M tokens',
    required: false,
    defaultValue: 'token-details',
    aliases: ['pp'],
    envVar: 'S3_PREFIX_P7M',
  },
  {
    name: 'startUtc',
    type: Core.GOConfigParameterType.STRING,
    description: 'Start time in UTC (format: YYYY-MM-DD HH:MM:SS or ISO 8601)',
    required: true,
    aliases: ['su'],
    envVar: 'START_UTC',
  },
  {
    name: 'endUtc',
    type: Core.GOConfigParameterType.STRING,
    description: 'End time in UTC (format: YYYY-MM-DD HH:MM:SS or ISO 8601)',
    required: true,
    aliases: ['eu'],
    envVar: 'END_UTC',
  },
] as const;
