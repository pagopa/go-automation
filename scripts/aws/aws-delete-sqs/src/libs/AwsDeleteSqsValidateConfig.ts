/**
 * AWS Delete SQS - Validate Config Library
 */

import type { AwsDeleteSqsConfig } from '../types/index.js';

/**
 * Validate configuration for the script
 * @param config - Configuration for the script
 */

export function validateConfig(config: AwsDeleteSqsConfig): void {
  if (!config.purgeAll && !config.inputFile) {
    throw new Error('Either --purge-all or --input-file must be provided');
  }
}
