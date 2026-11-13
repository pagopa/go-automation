/**
 * Local diagnostic sink of the account port (EVO-AWSACCT-OPUS-01 §6.1): receives
 * details that must stay in the local log of the host, such as profile names and
 * raw credential errors, and never reach a runbook output or a propagated error.
 */
export type AwsAccountsDiagnosticFn = (message: string) => void;
