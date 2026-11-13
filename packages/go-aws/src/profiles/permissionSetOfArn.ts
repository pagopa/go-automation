/**
 * STS ARN of an IAM Identity Center (SSO) session:
 * `arn:<partition>:sts::<account>:assumed-role/AWSReservedSSO_<permission set>_<16 hex>/<session>`.
 * The permission set name may itself contain `_`, so the hash is matched from the end.
 */
const SSO_SESSION_ARN = /^arn:aws[a-z-]*:sts::[0-9]{12}:assumed-role\/AWSReservedSSO_(?<set>.+)_[0-9a-f]{16}\/[^/]+$/u;

/**
 * Permission set of an SSO session, read from the caller ARN returned by
 * `sts:GetCallerIdentity` (EVO-AWSACCT-OPUS-01 §6.1). Lets a runtime prefer, for
 * example, a read-only permission set without relying on local profile names.
 *
 * @param arn - Caller ARN
 * @returns The permission set name, or `undefined` for a non-SSO identity (IAM user, other role)
 *
 * @example
 * ```typescript
 * permissionSetOfArn('arn:aws:sts::000000000000:assumed-role/AWSReservedSSO_ReadOnly_0123456789abcdef/user');
 * // 'ReadOnly'
 * ```
 */
export function permissionSetOfArn(arn: string): string | undefined {
  return SSO_SESSION_ARN.exec(arn.trim())?.groups?.['set'];
}
