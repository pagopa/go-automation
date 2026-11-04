import type { Dispatch } from '@go-automation/go-send';

import type { ValidatedConfigBase } from './ValidatedConfigBase.js';

/**
 * Validated configuration of the `direct` mode (pn-external-channels through
 * a tunnel): the base URL is required and the `requestId` template parsed.
 */
export interface DirectDispatchConfig extends ValidatedConfigBase {
  readonly mode: 'direct';
  /** `--ec-base-url`, with scheme and without trailing slashes. */
  readonly ecBaseUrl: string;
  readonly requestIdTemplate: Dispatch.RequestIdTemplate;
}
