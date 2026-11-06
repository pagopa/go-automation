import { DescribeInstancesCommand, StartInstancesCommand } from '@aws-sdk/client-ec2';
import { DescribeInstanceInformationCommand } from '@aws-sdk/client-ssm';
import { GOChildProcess, GOChildProcessError, isTcpPortOpen } from '@go-automation/go-common/core';
import { setTimeout as sleep } from 'node:timers/promises';

import { DispatchError } from '../DispatchError.js';
import type { SsmTunnelDefinition } from '../environment/SsmTunnelDefinition.js';
import type { SsmTunnelHandle } from './SsmTunnelHandle.js';
import type { SsmTunnelOptions } from './SsmTunnelOptions.js';
import type { TunnelProcess } from './TunnelProcess.js';

const LOCAL_HOST = '127.0.0.1';
const PORT_FORWARDING_DOCUMENT = 'AWS-StartPortForwardingSessionToRemoteHost';
const DEFAULT_BASTION_READY_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_PORT_READY_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;

/**
 * Opens the tunnel to pn-external-channels of a `direct` environment (§9.1)
 * with SSM port forwarding through a bastion.
 *
 * The AWS SDK cannot carry the port forwarding itself (its data channel is
 * implemented only by the `session-manager-plugin` of the CLI), so the
 * tunnel is an `aws ssm start-session` process; the SDK checks (and, if the
 * operator agrees, starts) the bastion first.
 *
 * 1. Local port already served → that tunnel is reused and never closed here.
 * 2. Bastion state (EC2): `running` → go on; `pending` → wait; `stopped` →
 *    ask, then start it and wait until it is running and online in SSM, or
 *    stop the run; any other state → stop the run.
 * 3. `aws ssm start-session` in its own process group (a Ctrl+C keeps the
 *    tunnel up while the run drains), then wait for the local port.
 *
 * Failures are `DispatchError`s with `TUNNEL_*` codes: they stop the run
 * before any call.
 */
export class SsmTunnel {
  constructor(private readonly options: SsmTunnelOptions) {}

  /**
   * Opens (or reuses) the tunnel.
   *
   * @returns The handle closing it at the end of the run
   * @throws DispatchError `TUNNEL_BASTION_STOPPED` (start declined),
   *   `TUNNEL_BASTION_UNAVAILABLE`, `TUNNEL_TIMEOUT`, `TUNNEL_FAILED`
   */
  public async open(): Promise<SsmTunnelHandle> {
    const { tunnel, logger } = this.options;
    if (await isTcpPortOpen(LOCAL_HOST, tunnel.localPort)) {
      logger.warning(
        `Porta ${tunnel.localPort} già in ascolto: uso il tunnel già aperto (non verrà chiuso dallo script)`,
      );
      return { reused: true, close: async () => Promise.resolve() };
    }
    await this.ensureBastionRunning();
    const forwarding = await this.startPortForwarding();
    logger.success(
      `Tunnel aperto: localhost:${tunnel.localPort} → ${tunnel.remoteHost}:${tunnel.remotePort} via ${tunnel.target}`,
    );
    return {
      reused: false,
      close: async () => {
        await forwarding.stop();
        logger.info(`Tunnel chiuso (localhost:${tunnel.localPort})`);
      },
    };
  }

  private async ensureBastionRunning(): Promise<void> {
    const { tunnel, logger } = this.options;
    const state = await this.bastionState();
    switch (state) {
      case 'running':
        return;
      case 'pending':
        logger.info(`Bastion ${tunnel.target} in avvio: attendo che sia pronto`);
        break;
      case 'stopped':
        await this.startBastion();
        break;
      default:
        throw new DispatchError(
          'TUNNEL_BASTION_UNAVAILABLE',
          `bastion ${tunnel.target} is ${state}: it cannot carry the tunnel now`,
        );
    }
    await this.waitUntilReady();
    logger.success(`Bastion ${tunnel.target} pronto`);
  }

  /** Starts the stopped bastion if the operator agrees, otherwise stops the run. */
  private async startBastion(): Promise<void> {
    const { tunnel, logger, confirmStartBastion, ec2 } = this.options;
    if (!(await confirmStartBastion(tunnel.target))) {
      throw new DispatchError(
        'TUNNEL_BASTION_STOPPED',
        `bastion ${tunnel.target} is stopped and was not started: no tunnel, no send`,
      );
    }
    logger.info(`Accendo il bastion ${tunnel.target}…`);
    await ec2.send(new StartInstancesCommand({ InstanceIds: [tunnel.target] }));
  }

  /** Waits until the bastion is `running` and its SSM agent `Online`. */
  private async waitUntilReady(): Promise<void> {
    const { tunnel } = this.options;
    const timeoutMs = this.options.bastionReadyTimeoutMs ?? DEFAULT_BASTION_READY_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    const interval = this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    for (;;) {
      if ((await this.bastionState()) === 'running' && (await this.ssmOnline())) return;
      if (Date.now() >= deadline) {
        throw new DispatchError(
          'TUNNEL_TIMEOUT',
          `bastion ${tunnel.target} not running and online in SSM within ${Math.round(timeoutMs / 1000)} s`,
        );
      }
      await sleep(interval);
    }
  }

  private async bastionState(): Promise<string> {
    const { tunnel, ec2 } = this.options;
    const answer = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [tunnel.target] }));
    const state = answer.Reservations?.[0]?.Instances?.[0]?.State?.Name;
    if (state === undefined) {
      throw new DispatchError('TUNNEL_BASTION_UNAVAILABLE', `bastion ${tunnel.target} not found`);
    }
    return state;
  }

  private async ssmOnline(): Promise<boolean> {
    const { tunnel, ssm } = this.options;
    const answer = await ssm.send(
      new DescribeInstanceInformationCommand({ Filters: [{ Key: 'InstanceIds', Values: [tunnel.target] }] }),
    );
    return answer.InstanceInformationList?.[0]?.PingStatus === 'Online';
  }

  /**
   * Starts `aws ssm start-session` and waits for the local port.
   *
   * @throws DispatchError `TUNNEL_FAILED` with the last lines of the CLI
   *   (e.g. missing session-manager-plugin, expired SSO session)
   */
  private async startPortForwarding(): Promise<TunnelProcess> {
    const { tunnel, region } = this.options;
    const args = portForwardingArgs(tunnel, region);
    const forwarding =
      this.options.createProcess?.(args) ?? new GOChildProcess({ command: 'aws', args, ownProcessGroup: true });
    forwarding.start();
    try {
      await forwarding.waitForTcpPort(LOCAL_HOST, tunnel.localPort, {
        timeoutMs: this.options.portReadyTimeoutMs ?? DEFAULT_PORT_READY_TIMEOUT_MS,
      });
    } catch (error: unknown) {
      await forwarding.stop();
      if (error instanceof GOChildProcessError) {
        throw new DispatchError('TUNNEL_FAILED', `aws ssm start-session: ${error.message}`, { cause: error });
      }
      throw error;
    }
    return forwarding;
  }
}

/** Arguments of `aws ssm start-session` for the port forwarding of `tunnel`. */
function portForwardingArgs(tunnel: SsmTunnelDefinition, region: string): ReadonlyArray<string> {
  const parameters = {
    portNumber: [String(tunnel.remotePort)],
    localPortNumber: [String(tunnel.localPort)],
    host: [tunnel.remoteHost],
  };
  return [
    'ssm',
    'start-session',
    '--target',
    tunnel.target,
    '--document-name',
    PORT_FORWARDING_DOCUMENT,
    '--profile',
    tunnel.awsProfile,
    '--region',
    region,
    '--parameters',
    JSON.stringify(parameters),
  ];
}
