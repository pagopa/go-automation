/**
 * Slack implementation of GOMessageWriter
 * Handles sending messages and uploading files via Slack Web API
 *
 * @example
 * ```typescript
 * import { WebClient } from '@slack/web-api';
 * import { Core } from '@go-automation/go-common';
 *
 * const writer = new Core.GOSlackMessageWriter({
 *   client: new WebClient(token),
 *   defaultChannel: '#ops',
 * });
 *
 * await writer.sendMessage({
 *   target: { conversationId: '#ops' },
 *   text: 'Hello from GOSlackMessageWriter!',
 *   format: 'markdown',
 * });
 * ```
 */

import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { basename } from 'node:path';

import type { FilesUploadV2Arguments } from '@slack/web-api';

import { GOEventEmitterBase } from '../../../events/GOEventEmitterBase.js';
import type { GOMessageWriter } from '../../GOMessageWriter.js';
import type { GOMessageWriterEventMap } from '../../GOMessageWriterEventMap.js';
import type { GOMessageReceipt } from '../../models/GOMessageReceipt.js';
import type { GOOutboundMessage } from '../../models/GOOutboundMessage.js';

import type { GOSlackMessageWriterOptions } from './GOSlackMessageWriterOptions.js';

export class GOSlackMessageWriter extends GOEventEmitterBase<GOMessageWriterEventMap> implements GOMessageWriter {
  readonly providerName = 'slack';

  private readonly client: GOSlackMessageWriterOptions['client'];
  private readonly defaultChannel: string;

  /**
   * Creates a new GOSlackMessageWriter instance
   *
   * @param options - Configuration with authenticated WebClient and default channel
   * @throws Error if client or defaultChannel is missing
   */
  constructor(options: GOSlackMessageWriterOptions) {
    super();
    if (!options.client) {
      throw new Error('Slack WebClient is required');
    }
    if (!options.defaultChannel) {
      throw new Error('Default channel is required');
    }
    this.client = options.client;
    this.defaultChannel = options.defaultChannel;
  }

  /**
   * Sends a message to Slack, optionally with file attachments
   * When attachments are present, the first file is uploaded with the text as initial_comment,
   * additional files are uploaded separately
   *
   * @param message - The outbound message to send
   * @returns Receipt with delivery status
   */
  async sendMessage(message: GOOutboundMessage): Promise<GOMessageReceipt> {
    const channel = message.target.conversationId || this.defaultChannel;
    const startTime = Date.now();

    try {
      if (message.attachments && message.attachments.length > 0) {
        return await this.sendWithAttachments(message, channel, startTime);
      }

      const result = await this.client.chat.postMessage({
        channel,
        text: message.text,
        mrkdwn: message.format === 'markdown',
        ...(message.target.threadId ? { thread_ts: message.target.threadId } : {}),
      });

      const duration = Date.now() - startTime;
      const messageId = result.ts;

      this.emit('writer:message:sent', {
        conversationId: channel,
        duration,
        ...(messageId ? { messageId } : {}),
      });

      const receipt: GOMessageReceipt = {
        success: true,
        providerResponse: result,
        ...(messageId ? { messageId, timestamp: new Date(Number(messageId) * 1000) } : {}),
      };
      return receipt;
    } catch (error) {
      this.emit('writer:message:error', {
        error: error instanceof Error ? error : new Error(String(error)),
        conversationId: channel,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Tests the Slack connection by calling auth.test
   *
   * @returns True if authentication succeeds
   * @throws Error if authentication fails
   */
  async testConnection(): Promise<boolean> {
    const startTime = Date.now();
    try {
      await this.client.auth.test();
      const duration = Date.now() - startTime;
      this.emit('writer:connection:tested', { success: true, duration });
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.emit('writer:connection:tested', { success: false, duration });
      throw error;
    }
  }

  /**
   * Handles sending a message with file attachments
   * Uses files.uploadV2 for each attachment
   */
  private async sendWithAttachments(
    message: GOOutboundMessage,
    channel: string,
    startTime: number,
  ): Promise<GOMessageReceipt> {
    const attachments = message.attachments;
    if (!attachments) {
      return { success: true };
    }
    let lastResult: unknown;

    for (const [i, attachment] of attachments.entries()) {
      const fileStartTime = Date.now();

      await this.validateFileExists(attachment.filePath);
      const fileName = attachment.fileName ?? basename(attachment.filePath);

      // Type assertion required: Slack SDK's FilesUploadV2Arguments intersection type
      // makes thread_ts required via FileThreadDestinationArgument, but it's optional at runtime
      const uploadArgs = {
        channel_id: channel,
        file: createReadStream(attachment.filePath),
        filename: fileName,
        title: attachment.title ?? fileName,
        ...(i === 0 ? { initial_comment: message.text } : {}),
        ...(message.target.threadId ? { thread_ts: message.target.threadId } : {}),
      } as FilesUploadV2Arguments;

      const uploadResult = await this.client.files.uploadV2(uploadArgs);

      const fileDuration = Date.now() - fileStartTime;
      this.emit('writer:file:uploaded', { fileName, conversationId: channel, duration: fileDuration });

      lastResult = uploadResult;
    }

    const duration = Date.now() - startTime;
    this.emit('writer:message:sent', { conversationId: channel, duration });

    return {
      success: true,
      providerResponse: lastResult,
    };
  }

  /**
   * Validates that a file exists at the given path
   *
   * @throws Error if the file does not exist
   */
  private async validateFileExists(filePath: string): Promise<void> {
    try {
      await access(filePath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }
  }
}
