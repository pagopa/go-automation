/**
 * How the run calls pn-external-channels in `direct` mode (§9.1).
 */
export interface ExternalChannelsAccess {
  /** Tunnel URL (`--ec-base-url`). */
  readonly baseUrl: string;
  /** Header `x-pagopa-extch-cx-id` (`--ec-client-id`). */
  readonly clientId: string;
}
