import type { AWSClientProvider } from './AWSClientProvider.js';
import type { AWSProfileSet } from './AWSProfileSet.js';

/**
 * An immutable view over a wider {@link AWSProfileSet}, restricted to the
 * profiles of one AWS account.
 *
 * The view owns nothing: client providers stay cached in the source set, so
 * views share credentials and connections and none may close what it did not
 * open. More than one profile can survive the narrowing — the same account is
 * often reachable through several roles — so log group discovery keeps its
 * candidates, within the right account.
 */
export class AWSAccountProfileSet implements AWSProfileSet {
  constructor(
    private readonly source: AWSProfileSet,
    private readonly profiles: ReadonlyArray<string>,
  ) {
    if (profiles.length === 0) {
      throw new Error('An account-scoped profile set needs at least one profile');
    }
  }

  get profileNames(): ReadonlyArray<string> {
    return this.profiles;
  }

  get first(): AWSClientProvider {
    const [firstProfile] = this.profiles;
    if (firstProfile === undefined) {
      throw new Error('An account-scoped profile set needs at least one profile');
    }
    return this.source.getClientProvider(firstProfile);
  }

  getClientProvider(profile: string): AWSClientProvider {
    if (!this.profiles.includes(profile)) {
      throw new Error(`Profile '${profile}' is outside the account-scoped profiles: ${this.profiles.join(', ')}`);
    }
    return this.source.getClientProvider(profile);
  }
}
