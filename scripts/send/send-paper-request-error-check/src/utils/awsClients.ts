import type { Core } from '@go-automation/go-common';
import { AWS } from '@go-automation/go-common';
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
 * Ottiene il servizio S3 associato al profilo Confinfo (utilizzato per tutte le operazioni SafeStorage S3).
 */
export function getConfinfoS3Service(
  script: Core.GOScript,
  config: SendPaperRequestErrorCheckConfig,
): AWS.AWSS3Service {
  const confinfoProfile = getConfinfoProfile(config);
  return new AWS.AWSS3Service(script.aws.clients.get(confinfoProfile).s3);
}

/**
 * Ottiene il servizio DynamoDB associato al profilo Core.
 */
export function getCoreDynamoDBService(
  script: Core.GOScript,
  config: SendPaperRequestErrorCheckConfig,
): AWS.AWSDynamoDBService {
  const coreProfile = getCoreProfile(config);
  return new AWS.AWSDynamoDBService(script.aws.clients.get(coreProfile).dynamoDB);
}

export function getConfinfoDynamoDBService(
  script: Core.GOScript,
  config: SendPaperRequestErrorCheckConfig,
): AWS.AWSDynamoDBService {
  const confinfoProfile = getConfinfoProfile(config);
  return new AWS.AWSDynamoDBService(script.aws.clients.get(confinfoProfile).dynamoDB);
}
