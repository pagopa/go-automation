import type { Dispatch } from '@go-automation/go-send';

/**
 * A mapping profile as loaded for the run.
 */
export interface LoadedProfile {
  readonly profile: Dispatch.MappingProfile;
  /** SHA-256 of the profile content: custom (file) profiles only, part of the run identity. */
  readonly sha256?: string;
}
