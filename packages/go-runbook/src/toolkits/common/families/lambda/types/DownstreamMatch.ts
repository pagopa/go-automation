/** A downstream routing match: the routed target and the line that matched. */
export interface DownstreamMatch {
  readonly target: string;
  readonly message: string;
}
