// Models
export type { GOMessageTarget } from './models/GOMessageTarget.js';
export type { GOOutboundMessage } from './models/GOOutboundMessage.js';
export type { GOOutboundAttachment } from './models/GOOutboundAttachment.js';
export type { GOReceivedMessage } from './models/GOReceivedMessage.js';
export type { GOInboundAttachment } from './models/GOInboundAttachment.js';
export type { GOMessageAuthor } from './models/GOMessageAuthor.js';
export type { GOMessageReceipt } from './models/GOMessageReceipt.js';
export type { GOMessageQuery } from './models/GOMessageQuery.js';
export type { GOMessagePage } from './models/GOMessagePage.js';

// Event maps
export type { GOMessageWriterEventMap } from './GOMessageWriterEventMap.js';
export type { GOMessageReaderEventMap } from './GOMessageReaderEventMap.js';

// Interfaces
export type { GOMessageWriter } from './GOMessageWriter.js';
export type { GOMessageReader } from './GOMessageReader.js';

// High-level messenger
export { GOMessenger } from './GOMessenger.js';
export type { GOMessengerOptions } from './GOMessengerOptions.js';

// Slack adapters
export { GOSlackMessageWriter } from './adapters/slack/GOSlackMessageWriter.js';
export type { GOSlackMessageWriterOptions } from './adapters/slack/GOSlackMessageWriterOptions.js';
export { GOSlackMessageReader } from './adapters/slack/GOSlackMessageReader.js';
export type { GOSlackMessageReaderOptions } from './adapters/slack/GOSlackMessageReaderOptions.js';
