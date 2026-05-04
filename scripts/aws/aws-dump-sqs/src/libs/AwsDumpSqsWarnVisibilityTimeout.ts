/**
 * AWS Dump SQS - Warn Visibility Timeout Library
 */

import { Core } from '@go-automation/go-common';
import type { AwsDumpSqsConfig } from '../types/index.js';

/**
 * Warns if the visibility timeout is shorter than the polling window.
 *
 * @param config - Dump configuration
 * @param logger - Logger instance
 */

export function warnVisibilityTimeout(config: AwsDumpSqsConfig, logger: Core.GOLogger): void {
  const waitTimeSeconds = 20;
  const pollingWindow = waitTimeSeconds * config.maxEmptyReceives;

  if (config.visibilityTimeout < pollingWindow) {
    logger.warning(
      `Visibility Timeout (${config.visibilityTimeout}s) is shorter than the polling ` +
        `window (${pollingWindow}s). Messages may reappear before the dump completes.`,
    );
  }
}
