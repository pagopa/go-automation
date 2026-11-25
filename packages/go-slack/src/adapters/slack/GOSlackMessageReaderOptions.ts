import type { WebClient } from '@slack/web-api';

/**
 * Configuration options for GOSlackMessageReader
 */
export interface GOSlackMessageReaderOptions {
  /** Authenticated Slack WebClient instance */
  readonly client: WebClient;
}
