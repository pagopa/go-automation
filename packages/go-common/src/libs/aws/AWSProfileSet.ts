import type { AWSClientProvider } from './AWSClientProvider.js';

/**
 * The AWS profiles a service is allowed to query.
 *
 * Services depend on this instead of {@link AWSMultiClientProvider} so they stay
 * agnostic about accounts: whoever composes them decides what the set contains,
 * and a service can only reach the accounts behind those profiles.
 */
export interface AWSProfileSet {
  /** Profile names in resolution order. Never empty. */
  readonly profileNames: ReadonlyArray<string>;

  /** Client provider for the first profile in resolution order. */
  readonly first: AWSClientProvider;

  /**
   * @param profile - A profile name belonging to this set
   * @returns The client provider bound to that profile
   * @throws Error when the profile is outside the set
   */
  getClientProvider(profile: string): AWSClientProvider;
}
