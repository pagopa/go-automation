import { channelsToMove, channelTargets } from './channelTargets.js';
import { releaseVersions, tagName } from './publishedPackages.js';
import { mergedReleaseCommits } from './releasePulls.js';
import type { ReleaseContext } from './types/ReleaseContext.js';

/**
 * Checks that every merged release PR is complete (§9.3, `audit`): each version it decided is on the
 * registry and has its git tag on the release commit, and the dist-tags of its packages point to the expected versions.
 * Read only: it never writes.
 *
 * @param context - Git, registry and GitHub access
 * @returns One message per problem, each with the recovery to run; empty when everything is complete
 */
export async function auditReleases(context: ReleaseContext): Promise<ReadonlyArray<string>> {
  const problems: string[] = [];
  const registryVersions = new Map<string, ReadonlyArray<string>>();
  const versionsOf = (name: string): ReadonlyArray<string> => {
    const cached = registryVersions.get(name);
    if (cached !== undefined) return cached;
    const versions = context.registry.versions(name);
    registryVersions.set(name, versions);
    return versions;
  };
  // Last release commit that released each package: promote-channels of that commit realigns it.
  const lastReleaseOf = new Map<string, string>();

  for (const [pull, commit] of await mergedReleaseCommits(context.github)) {
    const recovery = `re-run the failed jobs of the Release run of PR #${String(pull)} (merge commit ${commit})`;
    let versions;
    try {
      versions = releaseVersions(context.git, commit);
    } catch (error: unknown) {
      problems.push(
        `release PR #${String(pull)}: cannot read ${commit} (${errorMessage(error)}); fetch the full history`,
      );
      continue;
    }
    for (const entry of versions) {
      lastReleaseOf.set(entry.name, commit);
      const published = versionsOf(entry.name).includes(entry.version);
      if (!published)
        problems.push(`release PR #${String(pull)}: ${tagName(entry)} is not on the registry; ${recovery}`);
      const tagged = context.git.tagCommit(tagName(entry));
      if (published && tagged === undefined) {
        problems.push(`release PR #${String(pull)}: tag ${tagName(entry)} is missing; ${recovery}`);
      } else if (tagged !== undefined && tagged !== commit) {
        // The tag must identify the commit the version was published from (reconcile-tags refuses it too).
        problems.push(
          `release PR #${String(pull)}: tag ${tagName(entry)} points to ${tagged}, not to the release ${commit}`,
        );
      }
    }
  }

  for (const [name, versions] of registryVersions) {
    const moves = channelsToMove(channelTargets(versions), context.registry.distTags(name));
    for (const [channel, version] of moves) {
      problems.push(
        `${name}: dist-tag ${channel} must point to ${version} (last release: ${lastReleaseOf.get(name) ?? '?'}); move it with npm dist-tag add`,
      );
    }
  }
  return problems;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
