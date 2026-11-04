import type { Dispatch } from '@go-automation/go-send';

import type { B2BAccess } from './B2BAccess.js';
import type { ExternalChannelsAccess } from './ExternalChannelsAccess.js';

/**
 * Where and on behalf of whom the run sends: an environment of the
 * environments file, possibly overridden from the command line, or an ad-hoc
 * target made only of CLI parameters (§7.4.2).
 */
export interface DispatchTarget {
  /** Environment name, `ad-hoc` or `direct`. */
  readonly name: string;
  readonly description?: string;
  /** B2B API: present in `e2e` when `send` or `verify` is among the phases. */
  readonly b2b?: B2BAccess;
  /** pn-external-channels: present in `direct` mode. */
  readonly externalChannels?: ExternalChannelsAccess;
  readonly groupId?: string;
  /**
   * Production target: requires `--confirm-production` (environment
   * `production: true`, or `--ec-production` in `direct`).
   */
  readonly production: boolean;
  readonly sender?: Dispatch.DispatchSender;
  readonly defaults: Dispatch.FieldValues;
  readonly sharedDocument?: Dispatch.SharedDocumentConfig;
  /**
   * AWS SSO profile the environment expects for `pn-Timelines`: it must be
   * among `--aws-profiles` (consistency check, the clients come from GOScript).
   */
  readonly awsProfile?: string;
}
