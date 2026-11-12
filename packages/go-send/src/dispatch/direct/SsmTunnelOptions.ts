import type { EC2Client } from '@aws-sdk/client-ec2';
import type { SSMClient } from '@aws-sdk/client-ssm';
import type { GOLogger } from '@go-automation/go-common/core';

import type { SsmTunnelDefinition } from '../environment/SsmTunnelDefinition.js';
import type { BastionStartConfirmFn } from './BastionStartConfirmFn.js';
import type { TunnelProcessFactoryFn } from './TunnelProcessFactoryFn.js';

/**
 * Options of {@link ./SsmTunnel.SsmTunnel}.
 */
export interface SsmTunnelOptions {
  readonly tunnel: SsmTunnelDefinition;
  /** Region of the bastion (passed to `aws ssm start-session`). */
  readonly region: string;
  /** EC2 client of `tunnel.awsProfile`: state of the bastion, start. */
  readonly ec2: EC2Client;
  /** SSM client of `tunnel.awsProfile`: SSM agent of a bastion just started. */
  readonly ssm: SSMClient;
  readonly confirmStartBastion: BastionStartConfirmFn;
  readonly logger: Pick<GOLogger, 'info' | 'warning' | 'success'>;
  /** Default: `GOChildProcess` running the `aws` CLI in its own process group. */
  readonly createProcess?: TunnelProcessFactoryFn;
  /** Time for a started bastion to be running and online in SSM (default 5 min). */
  readonly bastionReadyTimeoutMs?: number;
  /** Time for the local port to open once `aws ssm start-session` runs (default 60 s). */
  readonly portReadyTimeoutMs?: number;
  /** Pause between two checks of the bastion (default 5 s). */
  readonly pollIntervalMs?: number;
}
