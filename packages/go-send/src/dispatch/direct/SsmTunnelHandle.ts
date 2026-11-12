/**
 * An open tunnel. `close()` ends the port forwarding the script started;
 * a tunnel the operator opened (`reused`) is left as it is.
 */
export interface SsmTunnelHandle {
  /** The local port was already served: the tunnel is not the script's. */
  readonly reused: boolean;
  close(): Promise<void>;
}
