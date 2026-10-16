import type { Core } from '@go-automation/go-common';
import { AWS } from '@go-automation/go-common';
import type { S3Client } from '@aws-sdk/client-s3';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { SendPaperRequestErrorCheckConfig } from '../types/index.js';

/**
 * Risolve il nome del profilo Core a partire dall'ambiente o dalla configurazione.
 */
function getCoreProfile(config: SendPaperRequestErrorCheckConfig): string {
  return config.awsProfileCore ?? `sso_pn-core-${config.envName ?? 'dev'}`;
}

/**
 * Risolve il nome del profilo Confinfo a partire dall'ambiente o dalla configurazione.
 */
function getConfinfoProfile(config: SendPaperRequestErrorCheckConfig): string {
  return config.awsProfileConfinfo ?? `sso_pn-confinfo-${config.envName ?? 'dev'}`;
}

/**
 * Ottiene il client S3 associato al profilo Confinfo (utilizzato per tutte le operazioni SafeStorage S3).
 */
export function getConfinfoS3Client(script: Core.GOScript, config: SendPaperRequestErrorCheckConfig): S3Client {
  const confinfoProfile = getConfinfoProfile(config);
  return script.aws.clients.get(confinfoProfile).s3;
}

/**
 * Ottiene il client DynamoDB associato al profilo Core.
 */
function getCoreDynamoDBClient(script: Core.GOScript, config: SendPaperRequestErrorCheckConfig): DynamoDBClient {
  const coreProfile = getCoreProfile(config);
  return script.aws.clients.get(coreProfile).dynamoDB;
}

/**
 * Ottiene il servizio DynamoDB associato al profilo Core.
 */
export function getCoreDynamoDBService(
  script: Core.GOScript,
  config: SendPaperRequestErrorCheckConfig,
): AWS.AWSDynamoDBService {
  const client = getCoreDynamoDBClient(script, config);
  return new AWS.AWSDynamoDBService(client);
}
