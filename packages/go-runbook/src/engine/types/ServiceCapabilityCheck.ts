import type { ServiceCapabilityPredicate } from './ServiceCapabilityPredicate.js';

/**
 * Optional port of the engine: service name → capability predicate. A required
 * service without a predicate is only checked for presence (not `null` or `undefined`).
 */
export type ServiceCapabilityCheck = Readonly<Record<string, ServiceCapabilityPredicate>>;
