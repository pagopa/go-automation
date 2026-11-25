/**
 * Options of {@link ./GOChildProcess.GOChildProcess.waitForTcpPort}.
 */
export interface GOChildProcessReadyOptions {
  /** Maximum wait for the port to accept connections (default 30 s). */
  readonly timeoutMs?: number;
  /** Pause between two connection attempts (default 250 ms). */
  readonly intervalMs?: number;
}
