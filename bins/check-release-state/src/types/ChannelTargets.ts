/** Where the npm dist-tags of one package must point. */
export interface ChannelTargets {
  /** Highest stable version; absent while only prereleases exist. */
  readonly latest?: string;
  /** Highest `-next.*` version, only when it is greater than {@link ChannelTargets.latest}. */
  readonly next?: string;
}
