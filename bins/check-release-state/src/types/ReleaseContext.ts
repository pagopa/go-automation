import type { GitHubPort } from './GitHubPort.js';
import type { GitPort } from './GitPort.js';
import type { RegistryPort } from './RegistryPort.js';

/** Everything the release commands need, injected (real adapters in the CLI, fakes in tests). */
export interface ReleaseContext {
  readonly git: GitPort;
  readonly registry: RegistryPort;
  readonly github: GitHubPort;
}
