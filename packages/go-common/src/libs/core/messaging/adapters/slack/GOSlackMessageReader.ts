/**
 * Slack implementation of GOMessageReader
 * Handles fetching and streaming messages from Slack channels via conversations.history
 *
 * @example
 * ```typescript
 * import { WebClient } from '@slack/web-api';
 * import { Core } from '@go-automation/go-common';
 *
 * const reader = new Core.GOSlackMessageReader({
 *   client: new WebClient(token),
 * });
 *
 * // Fetch a single page
 * const page = await reader.fetchMessages({
 *   target: { conversationId: 'C12345' },
 *   pageSize: 100,
 * });
 *
 * // Stream all messages
 * for await (const page of reader.fetchMessageStream({
 *   target: { conversationId: 'C12345' },
 *   limit: 500,
 * })) {
 *   for (const msg of page.messages) {
 *     console.log(msg.text);
 *   }
 * }
 * ```
 */

import { GOEventEmitterBase } from '../../../events/GOEventEmitterBase.js';
import type { GOMessageReader } from '../../GOMessageReader.js';
import type { GOMessageReaderEventMap } from '../../GOMessageReaderEventMap.js';
import type { GOInboundAttachment } from '../../models/GOInboundAttachment.js';
import type { GOMessageAuthor } from '../../models/GOMessageAuthor.js';
import type { GOMessagePage } from '../../models/GOMessagePage.js';
import type { GOMessageQuery } from '../../models/GOMessageQuery.js';
import type { GOMessageTarget } from '../../models/GOMessageTarget.js';
import type { GOReceivedMessage } from '../../models/GOReceivedMessage.js';

import type { GOSlackMessageReaderOptions } from './GOSlackMessageReaderOptions.js';

/** Default number of messages per page */
const DEFAULT_PAGE_SIZE = 100;

/** Shape of a Slack message from conversations.history */
interface SlackMessage {
  readonly ts?: string;
  readonly text?: string;
  readonly user?: string;
  readonly bot_id?: string;
  readonly username?: string;
  readonly thread_ts?: string;
  readonly reply_count?: number;
  readonly files?: ReadonlyArray<SlackFile>;
  readonly [key: string]: unknown;
}

/** Shape of a Slack file attachment */
interface SlackFile {
  readonly id?: string;
  readonly name?: string;
  readonly url_private?: string;
  readonly mimetype?: string;
  readonly size?: number;
}

export class GOSlackMessageReader extends GOEventEmitterBase<GOMessageReaderEventMap> implements GOMessageReader {
  readonly providerName = 'slack';

  private readonly client: GOSlackMessageReaderOptions['client'];

  /**
   * Creates a new GOSlackMessageReader instance
   *
   * @param options - Configuration with authenticated WebClient
   * @throws Error if client is missing
   */
  constructor(options: GOSlackMessageReaderOptions) {
    super();
    if (!options.client) {
      throw new Error('Slack WebClient is required');
    }
    this.client = options.client;
  }

  /**
   * Fetches a single page of messages from a Slack conversation
   * Complexity: O(N) where N is the number of messages in the page
   *
   * @param query - Query parameters including target channel and pagination
   * @returns A page of received messages with cursor for next page
   */
  async fetchMessages(query: GOMessageQuery): Promise<GOMessagePage> {
    const startTime = Date.now();
    const channel = query.target.conversationId;
    const limit = query.pageSize ?? DEFAULT_PAGE_SIZE;

    try {
      const result = await this.client.conversations.history({
        channel,
        limit,
        inclusive: true,
        ...(query.oldest ? { oldest: query.oldest } : {}),
        ...(query.newest ? { latest: query.newest } : {}),
      });

      const messages = this.mapSlackMessages(result.messages as SlackMessage[] | undefined, query.target);
      const filteredMessages = query.includeThreadReplies
        ? messages
        : messages.filter((msg) => !this.isThreadReply(msg));

      const duration = Date.now() - startTime;
      const rawCursor = result.response_metadata?.next_cursor;
      const nextCursor = rawCursor && rawCursor.length > 0 ? rawCursor : undefined;

      this.emit('reader:page:fetched', {
        conversationId: channel,
        messageCount: filteredMessages.length,
        duration,
        ...(nextCursor ? { cursor: nextCursor } : {}),
      });

      return {
        messages: filteredMessages,
        hasMore: result.has_more === true,
        target: query.target,
        ...(nextCursor ? { nextCursor } : {}),
      };
    } catch (error) {
      this.emit('reader:error', {
        error: error instanceof Error ? error : new Error(String(error)),
        conversationId: channel,
      });
      throw error;
    }
  }

  /**
   * Fetches a single message by its Slack timestamp ID
   *
   * @param messageId - Slack message timestamp (e.g. '1704067200.123456')
   * @param target - Target conversation containing the message
   * @returns The message if found, null otherwise
   */
  async getMessage(messageId: string, target: GOMessageTarget): Promise<GOReceivedMessage | null> {
    try {
      const result = await this.client.conversations.history({
        channel: target.conversationId,
        oldest: messageId,
        latest: messageId,
        limit: 1,
        inclusive: true,
      });

      const slackMessages = result.messages as SlackMessage[] | undefined;
      if (!slackMessages || slackMessages.length === 0) {
        return null;
      }

      const mapped = this.mapSlackMessages(slackMessages, target);
      return mapped[0] ?? null;
    } catch (error) {
      this.emit('reader:error', {
        error: error instanceof Error ? error : new Error(String(error)),
        conversationId: target.conversationId,
      });
      throw error;
    }
  }

  /**
   * Streams messages from a Slack conversation as an async generator
   * Automatically handles cursor-based pagination and respects the query limit
   * Complexity: O(N) where N is the total number of messages fetched
   *
   * @param query - Query parameters including target, pagination, and total limit
   * @yields Pages of messages until exhausted or limit reached
   */
  async *fetchMessageStream(query: GOMessageQuery): AsyncGenerator<GOMessagePage, void, unknown> {
    const streamStartTime = Date.now();
    const channel = query.target.conversationId;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const totalLimit = query.limit;

    let cursor: string | undefined;
    let totalMessages = 0;
    let totalPages = 0;

    try {
      let done = false;
      while (!done) {
        const pageStartTime = Date.now();

        const effectivePageSize =
          totalLimit !== undefined ? Math.min(pageSize, totalLimit - totalMessages) : pageSize;

        if (effectivePageSize <= 0) {
          break;
        }

        const result = await this.client.conversations.history({
          channel,
          limit: effectivePageSize,
          inclusive: totalPages === 0,
          ...(cursor ? { cursor } : {}),
          ...(query.oldest ? { oldest: query.oldest } : {}),
          ...(query.newest ? { latest: query.newest } : {}),
        });

        const slackMessages = result.messages as SlackMessage[] | undefined;
        const messages = this.mapSlackMessages(slackMessages, query.target);
        const filteredMessages = query.includeThreadReplies
          ? messages
          : messages.filter((msg) => !this.isThreadReply(msg));

        totalPages++;
        totalMessages += filteredMessages.length;

        const rawCursor = result.response_metadata?.next_cursor;
        const nextCursor = rawCursor && rawCursor.length > 0 ? rawCursor : undefined;
        const hasMore = result.has_more === true && (totalLimit === undefined || totalMessages < totalLimit);

        const pageDuration = Date.now() - pageStartTime;
        this.emit('reader:page:fetched', {
          conversationId: channel,
          messageCount: filteredMessages.length,
          duration: pageDuration,
          ...(nextCursor ? { cursor: nextCursor } : {}),
        });

        for (let i = 0; i < filteredMessages.length; i++) {
          this.emit('reader:message:received', {
            message: filteredMessages[i]!, // Safe: iterating within bounds
            index: totalMessages - filteredMessages.length + i,
          });
        }

        const yieldCursor = hasMore ? nextCursor : undefined;
        yield {
          messages: filteredMessages,
          hasMore,
          target: query.target,
          ...(yieldCursor ? { nextCursor: yieldCursor } : {}),
        };

        cursor = nextCursor;
        done = !hasMore || !cursor;
      }

      const streamDuration = Date.now() - streamStartTime;
      this.emit('reader:completed', {
        conversationId: channel,
        totalMessages,
        totalPages,
        duration: streamDuration,
      });
    } catch (error) {
      this.emit('reader:error', {
        error: error instanceof Error ? error : new Error(String(error)),
        conversationId: channel,
      });
      throw error;
    }
  }

  /**
   * Maps Slack API messages to GOReceivedMessage format
   * Complexity: O(N) where N is the number of messages
   */
  private mapSlackMessages(
    slackMessages: SlackMessage[] | undefined,
    target: GOMessageTarget,
  ): GOReceivedMessage[] {
    if (!slackMessages) {
      return [];
    }

    const results: GOReceivedMessage[] = [];
    for (const msg of slackMessages) {
      if (!msg.ts) {
        continue;
      }

      const author = this.mapSlackAuthor(msg);
      const attachments = this.mapSlackFiles(msg.files);

      const messageTarget: GOMessageTarget = msg.thread_ts
        ? { ...target, threadId: msg.thread_ts }
        : target;

      results.push({
        id: msg.ts,
        target: messageTarget,
        text: msg.text ?? '',
        sentAt: new Date(Number(msg.ts) * 1000),
        raw: msg,
        ...(author ? { author } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
      });
    }

    return results;
  }

  /**
   * Maps a Slack message to a GOMessageAuthor, if author info is available
   */
  private mapSlackAuthor(msg: SlackMessage): GOMessageAuthor | undefined {
    if (!msg.user && !msg.bot_id) {
      return undefined;
    }

    const author: GOMessageAuthor = {
      id: msg.user ?? msg.bot_id ?? '',
      isBot: msg.bot_id !== undefined,
      ...(msg.username ? { name: msg.username } : {}),
    };
    return author;
  }

  /**
   * Maps Slack file objects to GOInboundAttachment format
   */
  private mapSlackFiles(files: ReadonlyArray<SlackFile> | undefined): GOInboundAttachment[] {
    if (!files) {
      return [];
    }

    const results: GOInboundAttachment[] = [];
    for (const file of files) {
      if (file.id && file.url_private) {
        results.push({
          id: file.id,
          name: file.name ?? 'unknown',
          url: file.url_private,
          ...(file.mimetype ? { mimeType: file.mimetype } : {}),
          ...(file.size !== undefined ? { size: file.size } : {}),
        });
      }
    }
    return results;
  }

  /**
   * Checks if a message is a thread reply (has thread_ts different from its own ts)
   */
  private isThreadReply(message: GOReceivedMessage): boolean {
    return message.target.threadId !== undefined && message.target.threadId !== message.id;
  }
}
