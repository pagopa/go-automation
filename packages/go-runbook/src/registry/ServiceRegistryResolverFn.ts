import type { AWSExecutionTarget } from '@go-automation/go-common/aws';

import type { ResolvedServiceRegistry } from './ResolvedServiceRegistry.js';

/**
 * Builds the collaborators bound to one AWS account and region.
 *
 * The account is known per occurrence, not per run, so whoever executes
 * occurrences resolves the services through this instead of holding a registry
 * fixed to one account. The result carries the profiles the resolution
 * selected, so the execution can report what it read.
 */
export type ServiceRegistryResolverFn = (target: AWSExecutionTarget) => Promise<ResolvedServiceRegistry>;
