/** Scope of the published packages: the scope says whether a package is published. */
export const PUBLISHED_SCOPE = '@pagopa/';

/** Prefix of the head branch of a manual release PR (§9.3, fallback path since r15). */
export const RELEASE_BRANCH_PREFIX = 'release/';

/** Head branch of the release PR created by the GitHub App with `changesets/action/version` (§9.3.1). */
export const VERSION_PR_BRANCH = 'changeset-release/develop';

/** Branch that receives release PRs; every release is published from a merge commit on it (§9.3). */
export const DEVELOP_BRANCH = 'develop';

/** Prerelease identifier and dist-tag of the prerelease channel (§9.2). */
export const PRERELEASE_TAG = 'next';

/** Folder of the workspace packages. */
export const PACKAGES_DIRECTORY = 'packages';

/** Folder of the Changesets files. */
export const CHANGESET_DIRECTORY = '.changeset';
