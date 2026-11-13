import type { AwsAccountSelection } from '../../../accounts/AwsAccountSelection.js';

/**
 * Configuration of {@link QueryLambdaAcrossAccountsStep}: a Lambda log group
 * with the same name in several accounts (EVO-RBREORG-OPUS-01 P30).
 */
export interface QueryLambdaAcrossAccountsConfig {
  /** Error scan, or reconstruction of the invocations of the scanned request ids. */
  readonly queryKind: 'errors' | 'invocation';
  /** Query profile id of the trace. */
  readonly queryProfileId: string;
  /** Log group, identical in every account. */
  readonly logGroup: string;
  /** Error scan query; it must end with a `limit` equal to the row limit of the step. */
  readonly errorQuery: string;
  /**
   * Where to read: the logical accounts of a selection (rows tagged `sourceAccount` with the account name), or
   * every source configured in the CloudWatch Logs service (rows tagged `sourceKey`).
   */
  readonly sources: AwsAccountSelection | 'configured-sources';
  /** Texts of the step. */
  readonly labels: {
    /** Step label of the error scan. */
    readonly errors: string;
    /** Step label of the invocation reconstruction. */
    readonly invocation: string;
    /** Name in the execution narrative and in `<name> failed: …` errors. */
    readonly narrative: string;
    /** Reporter line, followed by `: <rows> righe`. */
    readonly report: string;
  };
  /** Variables written by the error scan. */
  readonly errorVars: {
    /** Comma-separated names of the sources read. */
    readonly checked: string;
    /** Total error rows. */
    readonly total?: string;
    /** Error rows of one source, by source name. */
    readonly bySource?: Readonly<Record<string, string>>;
  };
}
