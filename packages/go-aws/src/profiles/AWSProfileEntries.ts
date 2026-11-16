/** Configured profiles and, for each, where else its log groups may live. */
export interface AWSProfileEntries {
  /** Profile names in declaration order, ready for SSO login and client construction. */
  readonly profileNames: ReadonlyArray<string>;
  /** Fallback tokens declared per profile: a profile name or a 12-digit account id. */
  readonly fallbacksByProfile: ReadonlyMap<string, ReadonlyArray<string>>;
}
