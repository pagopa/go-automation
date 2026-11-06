import type { RequestIdTemplate } from '../ids/RequestIdTemplate.js';

/**
 * What the record factory needs to generate the `direct` requestId.
 */
export interface RecordFactoryDirectOptions {
  readonly runId: string;
  readonly template: RequestIdTemplate;
}
