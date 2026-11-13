import type { ServiceRegistry } from '../../toolkits/common/services/ServiceRegistry.js';

import type { BindServicesToOccurrenceOptions } from './BindServicesToOccurrenceOptions.js';

/**
 * Binds a service registry, built once per process, to one alarm occurrence.
 *
 * A registry built once talks to the account and region of the process. Without
 * this binding, an occurrence fired in a source account would query the wrong
 * account and return empty but "valid" results. The binding:
 * - in `oam-target` mode, scopes CloudWatch Logs to exactly the occurrence's
 *   account and region (`forTarget`), read through OAM;
 * - in `configured-profiles` mode, keeps the configured profiles
 *   (`forExecution`);
 * - in both modes, ties CloudWatch Logs and Athena to the occurrence's
 *   `activeOperations`, so that stopping it cancels the queries still running.
 *
 * The input registry is not modified.
 *
 * @param registry - Registry built once per process (e.g. by `createServiceRegistry`)
 * @param options - Occurrence target, its active-operation registry and the binding mode
 * @returns The registry scoped to the occurrence
 *
 * @example
 * ```typescript
 * const activeOperations = new AWSActiveOperationRegistry();
 * try {
 *   const services = bindServicesToOccurrence(baseServices, {
 *     target: { accountId: occurrence.awsAccountId, region: occurrence.awsRegion },
 *     activeOperations,
 *     mode: 'oam-target',
 *   });
 *   await executeRunbookForOccurrence({ logger, services }, input);
 * } finally {
 *   await activeOperations.stopAll();
 * }
 * ```
 */
export function bindServicesToOccurrence(
  registry: ServiceRegistry,
  options: BindServicesToOccurrenceOptions,
): ServiceRegistry {
  const { target, activeOperations, mode } = options;
  const cloudWatchLogs =
    mode === 'oam-target'
      ? registry.cloudWatchLogs.forTarget({ accountId: target.accountId, region: target.region }, activeOperations)
      : registry.cloudWatchLogs.forExecution(activeOperations);

  return {
    ...registry,
    cloudWatchLogs,
    athena: registry.athena.forExecution(activeOperations),
  };
}
