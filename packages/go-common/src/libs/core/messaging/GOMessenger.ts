/**
 * High-level messenger that composes a GOMessageWriter and optional GOMessageReader
 * Provides template rendering, error formatting, and convenient send/read methods
 *
 * @example
 * ```typescript
 * import { Core } from '@go-automation/go-common';
 *
 * const messenger = new Core.GOMessenger({
 *   writer,
 *   reader,
 *   defaultTarget: { conversationId: '#ops', kind: 'channel' },
 * });
 *
 * // Send a templated report with attachment
 * await messenger.sendReport(
 *   'Report: {{rowCount}} rows from {{startDate}} to {{endDate}}',
 *   { rowCount: 42, startDate: '2024-01-01', endDate: '2024-01-31' },
 *   [{ filePath: '/tmp/report.csv', fileName: 'report.csv' }],
 * );
 *
 * // Send an error notification
 * await messenger.sendError('Query failed', error);
 *
 * // Stream messages
 * for await (const page of messenger.readMessageStream({ target: { conversationId: 'C123' } })) {
 *   console.log(page.messages.length);
 * }
 * ```
 */

import type { GOMessageReader } from './GOMessageReader.js';
import type { GOMessageWriter } from './GOMessageWriter.js';
import type { GOMessengerOptions } from './GOMessengerOptions.js';
import type { GOMessagePage } from './models/GOMessagePage.js';
import type { GOMessageQuery } from './models/GOMessageQuery.js';
import type { GOMessageReceipt } from './models/GOMessageReceipt.js';
import type { GOMessageTarget } from './models/GOMessageTarget.js';
import type { GOOutboundAttachment } from './models/GOOutboundAttachment.js';
import type { GOReceivedMessage } from './models/GOReceivedMessage.js';

/** Default template pattern matching {{key}} */
const DEFAULT_TEMPLATE_PATTERN = /\{\{(\w+)\}\}/g;

export class GOMessenger {
  private readonly writer: GOMessageWriter;
  private readonly reader: GOMessageReader | undefined;
  private readonly defaultTarget: GOMessageTarget | undefined;
  private readonly templatePattern: RegExp;

  /**
   * Creates a new GOMessenger instance
   *
   * @param options - Configuration with writer, optional reader, and defaults
   * @throws Error if writer is not provided
   */
  constructor(options: GOMessengerOptions) {
    if (!options.writer) {
      throw new Error('GOMessageWriter is required');
    }
    this.writer = options.writer;
    this.reader = options.reader;
    this.defaultTarget = options.defaultTarget;
    this.templatePattern = options.templatePattern ?? DEFAULT_TEMPLATE_PATTERN;
  }

  // ==========================================================================
  // Writing
  // ==========================================================================

  /**
   * Sends a plain text message to the specified target or default target
   *
   * @param text - Message body
   * @param target - Optional target (uses defaultTarget if omitted)
   * @returns Receipt with delivery status
   * @throws Error if no target is available
   */
  async sendMessage(text: string, target?: GOMessageTarget): Promise<GOMessageReceipt> {
    const resolvedTarget = this.resolveTarget(target);
    return this.writer.sendMessage({
      target: resolvedTarget,
      text,
      format: 'markdown',
    });
  }

  /**
   * Sends a templated report message with optional file attachments
   * Template placeholders use {{key}} syntax and are replaced with data values
   *
   * @param template - Message template with {{key}} placeholders
   * @param data - Key-value pairs for template interpolation
   * @param attachments - Optional file attachments
   * @param target - Optional target (uses defaultTarget if omitted)
   * @returns Receipt with delivery status
   * @throws Error if no target is available
   */
  async sendReport(
    template: string,
    data: Readonly<Record<string, string | number>>,
    attachments?: ReadonlyArray<GOOutboundAttachment>,
    target?: GOMessageTarget,
  ): Promise<GOMessageReceipt> {
    const resolvedTarget = this.resolveTarget(target);
    const text = this.renderTemplate(template, data);

    return this.writer.sendMessage({
      target: resolvedTarget,
      text,
      format: 'markdown',
      ...(attachments ? { attachments } : {}),
    });
  }

  /**
   * Sends a formatted error notification with optional stack trace
   *
   * @param errorMessage - Human-readable error description
   * @param error - Optional Error object for stack trace
   * @param target - Optional target (uses defaultTarget if omitted)
   * @returns Receipt with delivery status
   * @throws Error if no target is available
   */
  async sendError(errorMessage: string, error?: Error, target?: GOMessageTarget): Promise<GOMessageReceipt> {
    const resolvedTarget = this.resolveTarget(target);
    const details = error ? `\n\n\`\`\`\n${error.stack ?? error.message}\n\`\`\`` : '';
    const text = `*Error during report execution*\n\n${errorMessage}${details}`;

    return this.writer.sendMessage({
      target: resolvedTarget,
      text,
      format: 'markdown',
    });
  }

  // ==========================================================================
  // Reading
  // ==========================================================================

  /**
   * Fetches a single page of messages from a conversation
   *
   * @param query - Query parameters
   * @returns A page of received messages
   * @throws Error if no reader is configured
   */
  async readMessages(query: GOMessageQuery): Promise<GOMessagePage> {
    return this.requireReader().fetchMessages(query);
  }

  /**
   * Streams messages as an async generator with automatic pagination
   *
   * @param query - Query parameters
   * @yields Pages of messages
   * @throws Error if no reader is configured
   */
  readMessageStream(query: GOMessageQuery): AsyncGenerator<GOMessagePage, void, unknown> {
    return this.requireReader().fetchMessageStream(query);
  }

  /**
   * Fetches a single message by its ID
   *
   * @param messageId - Provider-specific message identifier
   * @param target - Target conversation containing the message
   * @returns The message if found, null otherwise
   * @throws Error if no reader is configured
   */
  async getMessage(messageId: string, target: GOMessageTarget): Promise<GOReceivedMessage | null> {
    return this.requireReader().getMessage(messageId, target);
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  /**
   * Tests the connection to the messaging provider via the writer
   *
   * @returns True if connection is valid
   */
  async testConnection(): Promise<boolean> {
    return this.writer.testConnection();
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Resolves a target, falling back to the default target
   *
   * @throws Error if no target is available
   */
  private resolveTarget(target?: GOMessageTarget): GOMessageTarget {
    const resolved = target ?? this.defaultTarget;
    if (!resolved) {
      throw new Error('No message target specified and no default target configured');
    }
    return resolved;
  }

  /**
   * Returns the reader or throws if not configured
   *
   * @throws Error if no reader is configured
   */
  private requireReader(): GOMessageReader {
    if (!this.reader) {
      throw new Error('GOMessageReader is not configured. Provide a reader in GOMessengerOptions to use read methods');
    }
    return this.reader;
  }

  /**
   * Renders a template string by replacing {{key}} placeholders with data values
   * Complexity: O(K) where K is the number of keys in data
   *
   * @param template - Template string with {{key}} placeholders
   * @param data - Key-value pairs for interpolation
   * @returns Rendered string
   */
  private renderTemplate(template: string, data: Readonly<Record<string, string | number>>): string {
    return template.replace(this.templatePattern, (_match, key: string) => {
      const value = data[key];
      return value !== undefined ? String(value) : `{{${key}}}`;
    });
  }
}
