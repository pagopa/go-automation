/**
 * SSM port forwarding that opens the tunnel to pn-external-channels
 * (`AWS-StartPortForwardingSessionToRemoteHost`): from `localhost:localPort`
 * through the `target` instance (bastion) to `remoteHost:remotePort`.
 */
export interface SsmTunnelDefinition {
  /** AWS profile of the account owning the bastion; must be among `--aws-profiles`. */
  readonly awsProfile: string;
  /** EC2 instance id of the bastion (`i-…`). */
  readonly target: string;
  /** Host reached from the bastion (e.g. the DNS name of the internal load balancer). */
  readonly remoteHost: string;
  readonly remotePort: number;
  /** Local port; the port of `ecBaseUrl`. */
  readonly localPort: number;
}
