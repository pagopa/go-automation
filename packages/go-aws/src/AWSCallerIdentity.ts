/** The identity behind one profile's credentials, as returned by `sts:GetCallerIdentity`. */
export interface AWSCallerIdentity {
  /** 12-digit AWS account id owning the credentials. */
  readonly accountId: string;
  /** ARN of the caller (for an SSO session: `arn:aws:sts::<account>:assumed-role/AWSReservedSSO_<set>_<hash>/<user>`). */
  readonly arn?: string;
}
