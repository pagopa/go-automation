import type { Dispatch } from '@go-automation/go-send';

/**
 * Where and on behalf of whom the run sends: an environment of the
 * environments file, possibly overridden from the command line, or an ad-hoc
 * target made only of CLI parameters (§7.4.2).
 */
export interface DispatchTarget {
  /** Environment name, or `ad-hoc`. */
  readonly name: string;
  readonly description?: string;
  readonly basePath: string;
  /** Secret: never log it, show `apiKeyLabel`. */
  readonly apiKey: string;
  /** `$VARIABLE …abcd` or `--pn-api-key …abcd`. */
  readonly apiKeyLabel: string;
  readonly groupId?: string;
  readonly production: boolean;
  readonly sender?: Dispatch.DispatchSender;
  readonly defaults: Dispatch.FieldValues;
  readonly sharedDocument?: Dispatch.SharedDocumentConfig;
}
