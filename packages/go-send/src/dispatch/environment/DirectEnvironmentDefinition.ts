import type { FieldValues } from '../mapping/FieldValues.js';
import type { DispatchSender } from '../model/DispatchSender.js';
import type { SsmTunnelDefinition } from './SsmTunnelDefinition.js';

/**
 * A `mode: direct` environment of the environments file (§7.4.4): where
 * pn-external-channels is reached and, optionally, how the tunnel is opened.
 */
export interface DirectEnvironmentDefinition {
  readonly name: string;
  readonly description?: string;
  /** Base URL of pn-external-channels (the local end of the tunnel), with scheme. */
  readonly ecBaseUrl: string;
  /** `x-pagopa-extch-cx-id`; the script default when absent. */
  readonly ecClientId?: string;
  readonly production: boolean;
  readonly sender?: DispatchSender;
  /** Defaults for canonical fields (e.g. `direct.aar.key`, `documents.reference.*`). */
  readonly defaults: FieldValues;
  /** How the script opens the tunnel; absent when the operator opens it. */
  readonly tunnel?: SsmTunnelDefinition;
}
