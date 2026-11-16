import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';

import type { EC2Client } from '@aws-sdk/client-ec2';
import type { SSMClient } from '@aws-sdk/client-ssm';
import type { GOLogger } from '@pagopa/go-common/logging';
import { GOChildProcessError } from '@pagopa/go-common/process';

import { DispatchError } from '../../DispatchError.js';
import type { SsmTunnelDefinition } from '../../environment/SsmTunnelDefinition.js';
import { SsmTunnel } from '../SsmTunnel.js';
import type { SsmTunnelOptions } from '../SsmTunnelOptions.js';
import type { TunnelProcess } from '../TunnelProcess.js';

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** EC2 whose bastion goes through `states` (one per DescribeInstances, the last one repeats). */
function fakeEc2(states: ReadonlyArray<string>): { client: EC2Client; commands: string[] } {
  const commands: string[] = [];
  const remaining = [...states];
  const client = {
    send: async (command: object): Promise<unknown> => {
      await Promise.resolve();
      commands.push(command.constructor.name);
      if (command.constructor.name === 'StartInstancesCommand') return {};
      const state = remaining.length > 1 ? remaining.shift() : remaining[0];
      return { Reservations: [{ Instances: [{ State: { Name: state } }] }] };
    },
  } as unknown as EC2Client;
  return { client, commands };
}

function fakeSsm(pingStatus: string): SSMClient {
  return {
    send: async (): Promise<unknown> => {
      await Promise.resolve();
      return { InstanceInformationList: [{ PingStatus: pingStatus }] };
    },
  } as unknown as SSMClient;
}

class FakeProcess implements TunnelProcess {
  public started = false;
  public stopped = false;
  constructor(private readonly failure?: Error) {}
  public start(): void {
    this.started = true;
  }
  public async waitForTcpPort(): Promise<void> {
    await Promise.resolve();
    if (this.failure !== undefined) throw this.failure;
  }
  public async stop(): Promise<void> {
    await Promise.resolve();
    this.stopped = true;
  }
}

const LOGGER = { info: () => undefined, warning: () => undefined, success: () => undefined } as unknown as Pick<
  GOLogger,
  'info' | 'warning' | 'success'
>;

async function setup(
  states: ReadonlyArray<string>,
  overrides: Partial<SsmTunnelOptions> = {},
  process: FakeProcess = new FakeProcess(),
): Promise<{ tunnel: SsmTunnel; ec2: string[]; process: FakeProcess; args: ReadonlyArray<string>[] }> {
  const definition: SsmTunnelDefinition = {
    awsProfile: 'sso_pn-confinfo-test',
    target: 'i-065a7d9f4a91add01',
    remoteHost: 'internal-EcsA-1.eu-south-1.elb.amazonaws.com',
    remotePort: 8080,
    localPort: await freePort(),
  };
  const ec2 = fakeEc2(states);
  const args: ReadonlyArray<string>[] = [];
  const tunnel = new SsmTunnel({
    tunnel: definition,
    region: 'eu-south-1',
    ec2: ec2.client,
    ssm: fakeSsm('Online'),
    confirmStartBastion: async () => Promise.resolve(true),
    logger: LOGGER,
    createProcess: (processArgs) => {
      args.push(processArgs);
      return process;
    },
    pollIntervalMs: 1,
    ...overrides,
  });
  return { tunnel, ec2: ec2.commands, process, args };
}

const code = (expected: string) => (error: unknown) => error instanceof DispatchError && error.code === expected;

describe('SsmTunnel', () => {
  it('opens the port forwarding through a running bastion and closes it', async () => {
    const { tunnel, process, args } = await setup(['running']);

    const handle = await tunnel.open();

    assert.equal(handle.reused, false);
    assert.equal(process.started, true);
    const [cli] = args;
    assert.deepEqual(cli?.slice(0, 10), [
      'ssm',
      'start-session',
      '--target',
      'i-065a7d9f4a91add01',
      '--document-name',
      'AWS-StartPortForwardingSessionToRemoteHost',
      '--profile',
      'sso_pn-confinfo-test',
      '--region',
      'eu-south-1',
    ]);
    const parameters = JSON.parse(cli?.[11] ?? '{}') as Record<string, string[]>;
    assert.deepEqual(parameters['portNumber'], ['8080']);
    assert.deepEqual(parameters['host'], ['internal-EcsA-1.eu-south-1.elb.amazonaws.com']);
    await handle.close();
    assert.equal(process.stopped, true);
  });

  it('reuses a tunnel already listening on the local port, without touching the bastion', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const ec2 = fakeEc2(['stopped']);
      const tunnel = new SsmTunnel({
        tunnel: { awsProfile: 'p', target: 'i-065a7d9f4a91add01', remoteHost: 'h', remotePort: 8080, localPort: port },
        region: 'eu-south-1',
        ec2: ec2.client,
        ssm: fakeSsm('Online'),
        confirmStartBastion: async () => Promise.resolve(true),
        logger: LOGGER,
        createProcess: () => assert.fail('no process for a reused tunnel'),
      });
      const handle = await tunnel.open();
      assert.equal(handle.reused, true);
      assert.deepEqual(ec2.commands, []);
      await handle.close();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('asks before starting a stopped bastion, then waits until it is running and online', async () => {
    let asked: string | undefined;
    const { tunnel, ec2, process } = await setup(['stopped', 'pending', 'running'], {
      confirmStartBastion: async (instanceId) => {
        asked = instanceId;
        return Promise.resolve(true);
      },
    });

    await tunnel.open();

    assert.equal(asked, 'i-065a7d9f4a91add01');
    assert.ok(ec2.includes('StartInstancesCommand'));
    assert.equal(process.started, true);
  });

  it('stops the run when the operator does not start the bastion', async () => {
    const { tunnel, ec2, process } = await setup(['stopped'], {
      confirmStartBastion: async () => Promise.resolve(false),
    });

    await assert.rejects(tunnel.open(), code('TUNNEL_BASTION_STOPPED'));
    assert.ok(!ec2.includes('StartInstancesCommand'));
    assert.equal(process.started, false);
  });

  it('stops the run on a bastion that cannot carry the tunnel', async () => {
    const { tunnel } = await setup(['stopping']);
    await assert.rejects(tunnel.open(), code('TUNNEL_BASTION_UNAVAILABLE'));
  });

  it('gives up when a started bastion does not come online in time', async () => {
    const { tunnel } = await setup(['stopped', 'running'], {
      ssm: fakeSsm('ConnectionLost'),
      bastionReadyTimeoutMs: 20,
    });
    await assert.rejects(tunnel.open(), code('TUNNEL_TIMEOUT'));
  });

  it('reports the CLI output when the port forwarding fails, and stops the process', async () => {
    const failing = new FakeProcess(new GOChildProcessError('aws exited', ['SessionManagerPlugin is not found']));
    const { tunnel, process } = await setup(['running'], {}, failing);

    await assert.rejects(tunnel.open(), (error: unknown) => {
      assert.ok(error instanceof DispatchError && error.code === 'TUNNEL_FAILED');
      assert.match(error.message, /SessionManagerPlugin is not found/);
      return true;
    });
    assert.equal(process.stopped, true);
  });
});
