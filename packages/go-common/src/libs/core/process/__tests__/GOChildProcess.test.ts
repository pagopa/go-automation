import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';

import { isTcpPortOpen } from '../../network/isTcpPortOpen.js';
import { GOChildProcess } from '../GOChildProcess.js';
import { GOChildProcessError } from '../GOChildProcessError.js';

/** A free local port: bound by the OS, then released. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** A Node child running `code`. */
function node(code: string): GOChildProcess {
  return new GOChildProcess({ command: process.execPath, args: ['-e', code] });
}

describe('GOChildProcess', () => {
  it('waits until the child serves the port, then stops it', async () => {
    const port = await freePort();
    const child = node(
      `require('node:net').createServer((s) => s.end()).listen(${port}, '127.0.0.1', () => console.log('listening'))`,
    );
    child.start();
    try {
      await child.waitForTcpPort('127.0.0.1', port, { timeoutMs: 10_000, intervalMs: 50 });
      assert.equal(child.running, true);
    } finally {
      await child.stop();
    }
    assert.equal(child.running, false);
    assert.equal(await isTcpPortOpen('127.0.0.1', port), false, 'the port is closed with the process');
  });

  it('reports a child that exits before the port opens, with its last output', async () => {
    const child = node(`console.error('SessionManagerPlugin is not found'); process.exit(255)`);
    child.start();
    await assert.rejects(child.waitForTcpPort('127.0.0.1', await freePort(), { intervalMs: 20 }), (error: unknown) => {
      assert.ok(error instanceof GOChildProcessError);
      assert.match(error.message, /exited before the port opened \(exit code 255\)/);
      assert.deepEqual(error.outputTail, ['SessionManagerPlugin is not found']);
      return true;
    });
  });

  it('reports a command that cannot be started', async () => {
    const child = new GOChildProcess({ command: 'go-automation-command-that-does-not-exist', args: [] });
    child.start();
    await assert.rejects(child.waitForTcpPort('127.0.0.1', await freePort(), { intervalMs: 20 }), /could not start/);
    assert.equal(child.running, false);
  });

  it('stops the child and fails when the port does not open in time', async () => {
    const child = node('setInterval(() => {}, 1000)');
    child.start();
    await assert.rejects(
      child.waitForTcpPort('127.0.0.1', await freePort(), { timeoutMs: 300, intervalMs: 50 }),
      /did not open in time/,
    );
    assert.equal(child.running, false);
  });

  it('kills a child that ignores SIGTERM after the grace period', async () => {
    const port = await freePort();
    const child = node(
      `process.on('SIGTERM', () => {}); require('node:net').createServer().listen(${port}, '127.0.0.1')`,
    );
    child.start();
    await child.waitForTcpPort('127.0.0.1', port, { timeoutMs: 10_000, intervalMs: 50 });
    await child.stop(200);
    assert.equal(child.running, false);
  });

  it('with its own process group, stops the processes it started too', async () => {
    const port = await freePort();
    // Like aws ssm start-session: the port is served by a grandchild (the plugin).
    const server = `require('node:net').createServer().listen(${port}, '127.0.0.1')`;
    const child = new GOChildProcess({
      command: process.execPath,
      args: [
        '-e',
        `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(server)}], { stdio: 'ignore' }); setInterval(() => {}, 1000)`,
      ],
      ownProcessGroup: true,
    });
    child.start();
    await child.waitForTcpPort('127.0.0.1', port, { timeoutMs: 10_000, intervalMs: 50 });
    await child.stop();
    assert.equal(child.running, false);
    // The grandchild got the signal with the group; it may need a moment to exit.
    let open = true;
    for (let attempt = 0; attempt < 40 && open; attempt++) {
      open = await isTcpPortOpen('127.0.0.1', port);
      if (open) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(open, false, 'the grandchild serving the port is gone');
  });

  it('refuses to start twice', () => {
    const child = node('');
    child.start();
    assert.throws(() => child.start(), /already started/);
  });
});

describe('isTcpPortOpen', () => {
  it('tells an open port from a closed one', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      assert.equal(await isTcpPortOpen('127.0.0.1', port), true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    assert.equal(await isTcpPortOpen('127.0.0.1', port), false);
  });
});
