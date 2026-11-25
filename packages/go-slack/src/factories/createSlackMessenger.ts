import { WebClient } from '@slack/web-api';

import { GOMessenger } from '../GOMessenger.js';
import { GOSlackMessageWriter } from '../adapters/slack/GOSlackMessageWriter.js';

export interface GOSlackMessengerOptions {
  readonly token: string;
  readonly channel: string;
}

export function createSlackMessenger(options: GOSlackMessengerOptions): GOMessenger {
  const client = new WebClient(options.token);
  const writer = new GOSlackMessageWriter({
    client,
    defaultChannel: options.channel,
  });

  return new GOMessenger({
    writer,
    defaultTarget: {
      conversationId: options.channel,
      kind: 'channel',
    },
  });
}
