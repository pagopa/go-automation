import type { ExternalChannelsApi } from '../direct/ExternalChannelsApi.js';
import type { RequestIdTemplate } from '../ids/RequestIdTemplate.js';

/**
 * Settings of the `direct` mode of a session (§9).
 */
export interface DirectModeOptions {
  readonly api: ExternalChannelsApi;
  readonly requestIdTemplate: RequestIdTemplate;
}
