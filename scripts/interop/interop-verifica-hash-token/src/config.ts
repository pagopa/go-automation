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
 * Default CloudWatch Logs query string for application logs
 */
export const DEFAULT_CW_QUERY_APPLICATION = `fields @timestamp, @message
| sort @timestamp asc
| filter (@message like /ERROR/ or stream = "stderr") and (@message like "Request failed with status code 500" or @message like "Request failed with status code 503") and @message like "[CID="
| filter @logStream not like /adot-collector/
| filter pod_app like /interop-be-audit-signer/
| limit 1`;

/**
 * Default CloudWatch Logs query string for CID log details
 */
export const DEFAULT_CW_QUERY_CID = `fields @timestamp, @message
| sort @timestamp asc
| parse @message "[CID=*]" as CID
| filter CID = cid_replace
| display @message
| limit 10`;

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
    required: false,
    defaultValue: DEFAULT_CW_QUERY_APPLICATION,
    aliases: ['qa'],
    envVar: 'CW_QUERY_APPLICATION',
  },
  {
    name: 'cw.queryCid',
    type: Core.GOConfigParameterType.STRING,
    description: 'CloudWatch Logs query string for CID log details',
    required: false,
    defaultValue: DEFAULT_CW_QUERY_CID,
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
