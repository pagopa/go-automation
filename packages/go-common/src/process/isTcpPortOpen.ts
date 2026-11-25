import { Socket } from 'node:net';

/** Default time to wait for the TCP handshake. */
const DEFAULT_TIMEOUT_MS = 1_000;

/**
 * Whether something accepts TCP connections on `host:port` (the handshake
 * completes). The connection is closed at once; nothing is sent.
 *
 * @param host - Host name or address (e.g. `127.0.0.1`)
 * @param port - TCP port
 * @param timeoutMs - Time to wait for the handshake (default 1 s)
 * @returns `true` when the connection is accepted, `false` when refused, unreachable or timed out
 *
 * @example
 * ```typescript
 * if (await isTcpPortOpen('127.0.0.1', 8888)) console.log('tunnel already open');
 * ```
 */
export async function isTcpPortOpen(
  host: string,
  port: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = new Socket();
    const done = (open: boolean): void => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}
