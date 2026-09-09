/**
 * Factory for creating the AWS ServiceRegistry from the script AWS provider.
 */

import { Core } from '@go-automation/go-common';
import type { AWSServiceProvider } from '@go-automation/go-common/aws';

import type { RunbookReporter } from '../registry/RunbookReporter.js';
import type { ServiceRegistry } from '../registry/ServiceRegistry.js';

/**
 * Creates a ServiceRegistry from the unified script AWS provider.
 *
 * The registry reads whichever account the script's AWS profiles resolve to
 * first. That is correct only for callers pinned to a single account: anything
 * executing occurrences across several accounts must go through a
 * `ServiceRegistryResolverFn`, which binds the services to the account of
 * each occurrence.
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
  return buildServiceRegistry(script.aws.services, reporter, new Core.GOHttpClient({}));
}

/**
 * Assembles a registry from an AWS service provider already bound to the right
 * account, so resolvers and the script factory agree on its composition.
 *
 * @param services - AWS services, scoped to the target when there is one
 * @param reporter - Where steps report their narrative
 * @param http - HTTP client shared across the run
 * @returns The assembled service registry
 */
export function buildServiceRegistry(
  services: AWSServiceProvider,
  reporter: RunbookReporter,
  http: Core.GOHttpClient,
): ServiceRegistry {
  return {
    cloudWatchLogs: services.cloudWatchLogs,
    cloudWatchMetrics: services.cloudWatchMetrics,
    athena: services.athena,
    dynamodb: services.dynamoDB,
    http,
    reporter,
  };
}
