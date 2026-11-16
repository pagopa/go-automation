import type { WebClient } from '@slack/web-api';

/**
 * Configuration options for GOSlackMessageWriter
 */
export interface GOSlackMessageWriterOptions {
  /** Authenticated Slack WebClient instance */
  readonly client: WebClient;
  /** Default channel ID or name for sending messages */
  readonly defaultChannel: string;
}
