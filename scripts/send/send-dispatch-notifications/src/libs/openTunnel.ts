/**
 * Tunnel to pn-external-channels of a `direct` environment (§9.1).
 */

import { EC2_CLIENT } from '@pagopa/go-aws/ec2';
import type { GOScript } from '@go-automation/go-script';
import { Dispatch } from '@go-automation/go-send';

import type { DispatchTarget } from '../types/DispatchTarget.js';

/**
 * Opens the tunnel of a `direct` environment that declares one, in real runs
 * only (a dry run makes no call). AWS clients come from `script.aws` for the
 * tunnel profile; a stopped bastion is started only if the operator agrees.
 *
 * @param script - GOScript instance (AWS clients, prompt, logger)
 * @param target - Resolved target
 * @param dryRun - `--dry-run`
 * @returns The handle closing the tunnel, or `undefined` when no tunnel is opened
 * @throws DispatchError `TUNNEL_*` when the tunnel cannot be opened
 */
export async function openTunnel(
  script: GOScript,
  target: DispatchTarget,
  dryRun: boolean,
): Promise<Dispatch.SsmTunnelHandle | undefined> {
  const { tunnel } = target;
  if (tunnel === undefined || dryRun) return undefined;
  script.logger.section('Tunnel');
  const clients = script.aws.clients.get(tunnel.awsProfile);
  return new Dispatch.SsmTunnel({
    tunnel,
    region: clients.getRegion(),
    ec2: clients.client(EC2_CLIENT),
    ssm: clients.ssm,
    confirmStartBastion: async (instanceId: string) =>
      (await script.prompt.confirm(`Il bastion ${instanceId} è spento: accenderlo per aprire il tunnel?`, false)) ===
      true,
    logger: script.logger,
  }).open();
}
