import type { Core } from '@go-automation/go-common';
import { AWS } from '@go-automation/go-common';
import type { SendPaperRequestErrorCheckConfig } from '../types/index.js';

/**
 * Risolve il nome del profilo Core a partire da aws.profiles o override.
 */
function getCoreProfile(script: Core.GOScript, config: SendPaperRequestErrorCheckConfig): string {
  if (config.awsProfileCore) return config.awsProfileCore;
  const match = script.aws.clients.profileNames.find((p) => p.toLowerCase().includes('core'));
  if (match) return match;
  throw new Error(
    `Impossibile identificare il profilo AWS Core tra quelli configurati: [${script.aws.clients.profileNames.join(', ')}]. ` +
      `Assicurati che il nome del profilo contenga "core" o specifica --awsProfileCore.`,
  );
}

/**
 * Risolve il nome del profilo Confinfo a partire da aws.profiles o override.
 */
function getConfinfoProfile(script: Core.GOScript, config: SendPaperRequestErrorCheckConfig): string {
  if (config.awsProfileConfinfo) return config.awsProfileConfinfo;
  const match = script.aws.clients.profileNames.find((p) => p.toLowerCase().includes('confinfo'));
  if (match) return match;
  throw new Error(
    `Impossibile identificare il profilo AWS Confinfo tra quelli configurati: [${script.aws.clients.profileNames.join(', ')}]. ` +
      `Assicurati che il nome del profilo contenga "confinfo" o specifica --awsProfileConfinfo.`,
  );
}

/**
 * Ottiene il servizio S3 associato al profilo Confinfo (utilizzato per SafeStorage S3).
 */
export function getConfinfoS3Service(
  script: Core.GOScript,
  config: SendPaperRequestErrorCheckConfig,
): AWS.AWSS3Service {
  const confinfoProfile = getConfinfoProfile(script, config);
  return new AWS.AWSS3Service(script.aws.clients.get(confinfoProfile).s3);
}

/**
 * Ottiene il servizio DynamoDB associato al profilo Core.
 */
export function getCoreDynamoDBService(
  script: Core.GOScript,
  config: SendPaperRequestErrorCheckConfig,
): AWS.AWSDynamoDBService {
  const coreProfile = getCoreProfile(script, config);
  return new AWS.AWSDynamoDBService(script.aws.clients.get(coreProfile).dynamoDB);
}

export function getConfinfoDynamoDBService(
  script: Core.GOScript,
  config: SendPaperRequestErrorCheckConfig,
): AWS.AWSDynamoDBService {
  const confinfoProfile = getConfinfoProfile(script, config);
  return new AWS.AWSDynamoDBService(script.aws.clients.get(confinfoProfile).dynamoDB);
}
