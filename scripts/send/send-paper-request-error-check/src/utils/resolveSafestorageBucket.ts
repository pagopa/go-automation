import type { SendPaperRequestErrorCheckConfig } from '../types/index.js';
import { getConfinfoS3Service } from './awsClients.js';
import { Core } from '@go-automation/go-common';

/**
 * Risolve il bucket S3 SafeStorage se non configurato esplicitamente.
 * Usa il profilo Confinfo per elencare i bucket (SafeStorage è nell'account Confinfo).
 */
export async function resolveSafestorageBucket(
  script: Core.GOScript,
  config: SendPaperRequestErrorCheckConfig,
  configuredBucket?: string,
): Promise<string> {
  if (configuredBucket) return configuredBucket;

  const s3Service = getConfinfoS3Service(script, config);
  const buckets = await s3Service.listBuckets();
  const target = buckets.find((b) => b.name.includes('safestorage') && !b.name.includes('staging'));
  if (target === undefined) {
    throw new Error(
      'Bucket SafeStorage non trovato con il profilo Confinfo: verificare le credenziali AWS o specificare --bucket.',
    );
  }

  return target.name;
}
