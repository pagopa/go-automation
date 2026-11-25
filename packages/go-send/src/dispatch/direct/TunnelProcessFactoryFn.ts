import type { TunnelProcess } from './TunnelProcess.js';

/**
 * Creates the port forwarding process from the `aws` CLI arguments.
 */
export type TunnelProcessFactoryFn = (args: ReadonlyArray<string>) => TunnelProcess;
