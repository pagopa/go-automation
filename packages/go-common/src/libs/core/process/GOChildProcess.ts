import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

import { isTcpPortOpen } from '../network/isTcpPortOpen.js';
import { GOChildProcessError } from './GOChildProcessError.js';
import type { GOChildProcessOptions } from './GOChildProcessOptions.js';
import type { GOChildProcessReadyOptions } from './GOChildProcessReadyOptions.js';

const DEFAULT_OUTPUT_TAIL_LINES = 20;
const DEFAULT_READY_TIMEOUT_MS = 30_000;
const DEFAULT_READY_INTERVAL_MS = 250;
const DEFAULT_STOP_TIMEOUT_MS = 5_000;
const LINE_BREAK = /\r?\n/;

/**
 * A long-running child process owned by the script, e.g. a port forwarding
 * (`aws ssm start-session`): started, awaited until it serves a TCP port,
 * stopped at the end.
 *
 * - No shell: the arguments are passed as they are.
 * - The last lines of stdout/stderr are kept for error messages.
 * - While running, the process is also killed if the parent exits without
 *   calling {@link stop} (e.g. `process.exit` after a fatal error), so it never
 *   outlives the script.
 *
 * @example
 * ```typescript
 * const tunnel = new GOChildProcess({ command: 'aws', args: ['ssm', 'start-session', ...] });
 * tunnel.start();
 * try {
 *   await tunnel.waitForTcpPort('127.0.0.1', 8888);
 *   // ... use the tunnel
 * } finally {
 *   await tunnel.stop();
 * }
 * ```
 */
export class GOChildProcess {
  private child: ChildProcess | undefined;
  private readonly tail: string[] = [];
  private readonly tailLines: number;
  private exitInfo: string | undefined;
  private startError: Error | undefined;
  private readonly killOnParentExit = (): void => {
    this.signal('SIGKILL');
  };

  constructor(private readonly options: GOChildProcessOptions) {
    this.tailLines = options.outputTailLines ?? DEFAULT_OUTPUT_TAIL_LINES;
  }

  /** Whether the process was started and has not exited yet. */
  public get running(): boolean {
    return this.child !== undefined && this.exitInfo === undefined && this.startError === undefined;
  }

  /** Last lines printed by the process (stdout and stderr). */
  public get outputTail(): ReadonlyArray<string> {
    return [...this.tail];
  }

  /**
   * Starts the process. A failure to start (e.g. the command is not
   * installed) is reported by {@link waitForTcpPort}.
   *
   * @throws Error when the process was already started
   */
  public start(): void {
    if (this.child !== undefined) throw new Error(`${this.options.command}: already started`);
    const child = spawn(this.options.command, [...this.options.args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: this.options.ownProcessGroup === true,
    });
    this.child = child;
    child.stdout?.on('data', (chunk: Buffer) => this.collect(chunk));
    child.stderr?.on('data', (chunk: Buffer) => this.collect(chunk));
    child.once('error', (error: Error) => {
      this.startError = error;
      process.off('exit', this.killOnParentExit);
    });
    child.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      this.exitInfo = signal === null ? `exit code ${String(code)}` : `signal ${signal}`;
      process.off('exit', this.killOnParentExit);
    });
    process.once('exit', this.killOnParentExit);
  }

  /**
   * Waits until `host:port` accepts TCP connections.
   *
   * @param host - Host the process serves (e.g. `127.0.0.1`)
   * @param port - Port the process serves
   * @param options - Timeout and polling interval
   * @throws GOChildProcessError when the process failed to start, exited
   *   first, or the port did not open in time (the process is then stopped)
   */
  public async waitForTcpPort(host: string, port: number, options: GOChildProcessReadyOptions = {}): Promise<void> {
    const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS);
    const interval = options.intervalMs ?? DEFAULT_READY_INTERVAL_MS;
    const what = `${this.options.command} on ${host}:${port}`;
    for (;;) {
      if (this.startError !== undefined) {
        throw new GOChildProcessError(`${what}: could not start (${this.startError.message})`, this.outputTail, {
          cause: this.startError,
        });
      }
      if (this.exitInfo !== undefined) {
        throw new GOChildProcessError(`${what}: exited before the port opened (${this.exitInfo})`, this.outputTail);
      }
      if (await isTcpPortOpen(host, port)) return;
      if (Date.now() >= deadline) {
        await this.stop();
        throw new GOChildProcessError(`${what}: the port did not open in time`, this.outputTail);
      }
      await sleep(interval);
    }
  }

  /**
   * Stops the process: `SIGTERM`, then `SIGKILL` if it is still running
   * after `timeoutMs`. Does nothing when it is not running.
   *
   * @param timeoutMs - Grace period before `SIGKILL` (default 5 s)
   */
  public async stop(timeoutMs: number = DEFAULT_STOP_TIMEOUT_MS): Promise<void> {
    const child = this.child;
    if (child === undefined || !this.running) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    this.signal('SIGTERM');
    const stopped = await Promise.race([exited.then(() => true), sleep(timeoutMs).then(() => false)]);
    if (!stopped) {
      this.signal('SIGKILL');
      await exited;
    }
  }

  /**
   * Signals the process, or its whole process group with `ownProcessGroup`
   * (so the processes it started end too).
   */
  private signal(signal: NodeJS.Signals): void {
    const pid = this.child?.pid;
    if (this.options.ownProcessGroup === true && pid !== undefined) {
      try {
        process.kill(-pid, signal);
        return;
      } catch {
        // The group is already gone: fall back to the process itself.
      }
    }
    this.child?.kill(signal);
  }

  private collect(chunk: Buffer): void {
    for (const line of chunk.toString('utf8').split(LINE_BREAK)) {
      if (line.trim() === '') continue;
      this.tail.push(line);
      if (this.tail.length > this.tailLines) this.tail.shift();
    }
  }
}
