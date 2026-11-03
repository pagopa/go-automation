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

  try {
    const s3Service = getConfinfoS3Service(script, config);
    const buckets = await s3Service.listBuckets();
    const target = buckets.find((b) => b.name && b.name.includes('safestorage') && !b.name.includes('staging'));
    if (target?.name) return target.name;
  } catch {
    script.logger.warning('Impossibile elencare i bucket S3, imposto bucket predefinito safe-storage');
  }

  return 'pn-safestorage-eu-south-1';
}
