import type { ServiceRegistry } from './ServiceRegistry.js';

/**
 * The collaborators bound to one execution target, with the AWS profiles they
 * were actually bound to.
 *
 * The profiles travel with the registry because only the resolution knows them:
 * a run configured with several profiles narrows down to the subset owning the
 * occurrence's account, and an execution that reported the whole configured
 * list would claim to have read accounts it never touched.
 */
export interface ResolvedServiceRegistry {
  readonly services: ServiceRegistry;
  /** Profiles selected for the target, in resolution order. Never empty. */
  readonly awsProfiles: ReadonlyArray<string>;
}
