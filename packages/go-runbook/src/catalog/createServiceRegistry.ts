/**
 * Factory for creating the AWS ServiceRegistry from the script AWS provider.
 */

import { Core } from '@go-automation/go-common';

import type { RunbookReporter } from '../registry/RunbookReporter.js';
import type { ServiceRegistry } from '../registry/ServiceRegistry.js';

/**
 * Creates a ServiceRegistry from the unified script AWS provider.
 *
 * CloudWatch Logs uses the multi-profile service because runbooks may need to
 * resolve log groups across the configured account list. Other services keep
 * the first-profile behavior used by the previous implementation.
 *
 * The narrative reporter is a required argument on purpose: a console default
 * would silently route step output to `script.logger`, which is wrong for
 * callers that render their own report (see `go-rta-check`).
 *
 * @param script - GOScript instance with initialized AWS providers
 * @param reporter - Where steps report their narrative
 * @returns ServiceRegistry with all services initialized
 */
export function createServiceRegistry(script: Core.GOScript, reporter: RunbookReporter): ServiceRegistry {
  return {
    cloudWatchLogs: script.aws.services.cloudWatchLogs,
    cloudWatchMetrics: script.aws.services.cloudWatchMetrics,
    athena: script.aws.services.athena,
    dynamodb: script.aws.services.dynamoDB,
    http: new Core.GOHttpClient({}),
    reporter,
  };
}
