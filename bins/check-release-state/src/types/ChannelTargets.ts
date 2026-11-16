/** Where the npm dist-tags of one package must point (EVO-PKGPUB-OPUS-01 §9.3, `promote-channels`). */
export interface ChannelTargets {
  /** Highest stable version; absent while only prereleases exist. */
  readonly latest?: string;
  /** Highest `-next.*` version, only when it is greater than {@link ChannelTargets.latest}. */
  readonly next?: string;
}
