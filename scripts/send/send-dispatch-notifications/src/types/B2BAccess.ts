/**
 * How the run calls the B2B API of SEND.
 */
export interface B2BAccess {
  readonly basePath: string;
  /** Secret: never log it, show `apiKeyLabel`. */
  readonly apiKey: string;
  /** `$VARIABLE …abcd` or `--pn-api-key …abcd`. */
  readonly apiKeyLabel: string;
}
