import type { GOChildProcessReadyOptions } from '@pagopa/go-common/process';

/**
 * The process holding the port forwarding (`aws ssm start-session`): the part
 * of `GOChildProcess` the tunnel uses, so tests can replace it.
 */
export interface TunnelProcess {
  start(): void;
  waitForTcpPort(host: string, port: number, options?: GOChildProcessReadyOptions): Promise<void>;
  stop(): Promise<void>;
}
