import type { ServiceCapabilityCheck } from '../../../engine/types/ServiceCapabilityCheck.js';
import type { ServiceCapabilityPredicate } from '../../../engine/types/ServiceCapabilityPredicate.js';
import type { OperationalServiceName } from './OperationalServiceName.js';

/**
 * Methods each operational service must expose, the ones the steps call.
 * A received service missing one of them is rejected before the first step
 * (EVO-RBREORG-OPUS-01 §7.1.3 A, RBREORG-14).
 */
export const OPERATIONAL_SERVICE_METHODS: Readonly<Record<OperationalServiceName, ReadonlyArray<string>>> = {
  cloudWatchLogs: ['query', 'queryWithStatistics', 'forTarget', 'forExecution', 'getConfiguredSources'],
  cloudWatchMetrics: ['getMetricData'],
  athena: ['query', 'forExecution'],
  dynamodb: ['query', 'getItem', 'updateItem', 'putItem'],
  http: ['request'],
  awsAccounts: [
    'environment',
    'hasOccurrence',
    'resolve',
    'accountOfOccurrence',
    'prepare',
    'cloudWatchLogsFor',
    'resolvedAccounts',
    'bindToOccurrence',
  ],
};

function exposes(methods: ReadonlyArray<string>): ServiceCapabilityPredicate {
  return (service) =>
    typeof service === 'object' &&
    service !== null &&
    methods.every((method) => typeof (service as Readonly<Record<string, unknown>>)[method] === 'function');
}

/** Capability predicates of the operational services, injected by {@link OperationalRunbookEngine}. */
export const OPERATIONAL_SERVICE_CAPABILITIES: ServiceCapabilityCheck = Object.fromEntries(
  Object.entries(OPERATIONAL_SERVICE_METHODS).map(([name, methods]) => [name, exposes(methods)]),
);
