/**
 * Logical AWS account, `<product>/<account>` in lower case (for example
 * `send/core`): what a runbook reads, without the environment, the account id or
 * the credentials (EVO-AWSACCT-OPUS-01 §5.1). Build it with `parseAwsLogicalAccount`.
 */
export type AwsLogicalAccount = string & { readonly __brand: 'AwsLogicalAccount' };
