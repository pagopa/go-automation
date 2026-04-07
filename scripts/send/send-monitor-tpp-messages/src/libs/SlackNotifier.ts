/**
 * Slack Notifier
 * Thin wrapper around GOSlackMessageWriter + GOMessenger for backward compatibility
 */

import { WebClient } from '@slack/web-api';
import { Core } from '@go-automation/go-common';

import type { ReportData } from '../types/ReportData.js';

/**
 * Manages Slack notifications including messages and file uploads
 * Delegates to GOMessenger and GOSlackMessageWriter from go-common
 */
export class SlackNotifier {
  private readonly messenger: Core.GOMessenger;

  /**
   * Creates a new Slack Notifier instance
   * @param token - Slack bot token
   * @param channel - Slack channel ID or name
   * @throws Error if token or channel is not provided
   */
  constructor(token: string, channel: string) {
    if (!token) {
      throw new Error('Slack token is required');
    }
    if (!channel) {
      throw new Error('Slack channel is required');
    }

    const client = new WebClient(token);
    const writer = new Core.GOSlackMessageWriter({ client, defaultChannel: channel });

    this.messenger = new Core.GOMessenger({
      writer,
      defaultTarget: { conversationId: channel, kind: 'channel' },
    });
  }

  /**
   * Sends a text message to the configured Slack channel
   * @param text - Message text (supports Slack markdown)
   * @returns Message receipt
   */
  async sendMessage(text: string): Promise<Core.GOMessageReceipt> {
    return this.messenger.sendMessage(text);
  }

  /**
   * Sends a report to Slack, optionally with a CSV file attachment
   * @param messageTemplate - Message template for the report
   * @param reportData - Data to include in the report
   * @param csvFilePath - Optional path to CSV file to attach
   * @returns Message receipt
   */
  async sendReport(
    messageTemplate: string,
    reportData: Partial<ReportData>,
    csvFilePath?: string | null,
  ): Promise<Core.GOMessageReceipt> {
    const defaults: ReportData = {
      startDate: 'N/A',
      endDate: 'N/A',
      rowCount: 0,
      fileName: 'report.csv',
      analysis: 'No analysis available',
      timestamp: new Date().toISOString(),
    };
    // Safe cast: defaults provides all required keys, so no value is undefined after merge
    const data: ReportData = { ...defaults, ...reportData } as ReportData;

    if (csvFilePath) {
      return this.messenger.sendReport(messageTemplate, data, [{ filePath: csvFilePath, fileName: data.fileName }]);
    }

    const templateWithNote = `${messageTemplate}\n\n_No attachment: query returned no results._`;
    return this.messenger.sendReport(templateWithNote, data);
  }

  /**
   * Sends an error notification to Slack
   * @param errorMessage - Human-readable error description
   * @param error - Optional Error object for stack trace
   * @returns Message receipt
   */
  async sendError(errorMessage: string, error?: Error): Promise<Core.GOMessageReceipt> {
    return this.messenger.sendError(errorMessage, error);
  }

  /**
   * Tests the Slack connection by calling auth.test
   * @returns True if connection is successful
   * @throws Error if authentication fails
   */
  async testConnection(): Promise<boolean> {
    return this.messenger.testConnection();
  }
}
