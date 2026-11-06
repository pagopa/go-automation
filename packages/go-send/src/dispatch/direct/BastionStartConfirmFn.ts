/**
 * Asks the operator whether to start the stopped bastion of the tunnel.
 *
 * @param instanceId - EC2 instance id of the bastion
 * @returns `true` to start it, `false` to stop the run
 */
export type BastionStartConfirmFn = (instanceId: string) => Promise<boolean>;
