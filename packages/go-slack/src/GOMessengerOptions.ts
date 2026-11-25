import type { GOMessageReader } from './GOMessageReader.js';
import type { GOMessageWriter } from './GOMessageWriter.js';
import type { GOMessageTarget } from './models/GOMessageTarget.js';

/**
 * Configuration options for GOMessenger
 */
export interface GOMessengerOptions {
  /** Writer transport for sending messages */
  readonly writer: GOMessageWriter;
  /** Optional reader transport for fetching messages */
  readonly reader?: GOMessageReader;
  /** Default target used when no target is specified in send methods */
  readonly defaultTarget?: GOMessageTarget;
  /** RegExp pattern for template interpolation (default: /\{\{(\w+)\}\}/g) */
  readonly templatePattern?: RegExp;
}
