import type { AWSActiveOperationRegistry, AWSExecutionTarget } from '@pagopa/go-aws';

import type { ResolvedServiceRegistry } from './ResolvedServiceRegistry.js';

/**
 * Builds the collaborators bound to one AWS account and region.
 *
 * The account is known per occurrence, not per run, so whoever executes
 * occurrences resolves the services through this instead of holding a registry
 * fixed to one account. The result carries the profiles the resolution
 * selected, so the execution can report what it read. The optional registry of
 * remote operations belongs to the occurrence: a resolver that binds services to
 * the occurrence (OAM) ties their queries to it.
 */
export type ServiceRegistryResolverFn = (
  target: AWSExecutionTarget,
  activeOperations?: AWSActiveOperationRegistry,
) => Promise<ResolvedServiceRegistry>;
