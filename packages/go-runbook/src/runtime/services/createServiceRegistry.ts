/**
 * Factory for creating the AWS ServiceRegistry from an AWS service provider.
 */

import type { AWSServiceProvider } from '@pagopa/go-aws/all';
import type { GOHttpClient } from '@pagopa/go-common/http';

import type { CreateServiceRegistryDeps } from './CreateServiceRegistryDeps.js';
import type { RunbookReporter } from '../../engine/reporting/RunbookReporter.js';
import type { ServiceRegistry } from '../../toolkits/common/services/ServiceRegistry.js';

/**
 * Creates a ServiceRegistry from an AWS service provider and an HTTP client.
 *
 * The registry reads whichever account the provider's AWS profiles resolve to
 * first. That is correct only for callers pinned to a single account: anything
 * executing occurrences across several accounts must go through a
 * `ServiceRegistryResolverFn`, which binds the services to the account of
 * each occurrence.
 *
 * The narrative reporter is a required argument on purpose: a console default
 * would silently route step output to `script.logger`, which is wrong for
 * callers that render their own report (see `go-rta-check`).
 *
 * @param deps - AWS services and HTTP client of the run
 * @param reporter - Where steps report their narrative
 * @returns ServiceRegistry with all services initialized
 *
 * @example
 * ```typescript
 * const services = createServiceRegistry({ services: script.aws.services, http: new GOHttpClient({}) }, reporter);
 * ```
 */
export function createServiceRegistry(deps: CreateServiceRegistryDeps, reporter: RunbookReporter): ServiceRegistry {
  return buildServiceRegistry(deps.services, reporter, deps.http);
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
  http: GOHttpClient,
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
