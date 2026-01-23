/**
 * Slack Notifier
 * Handles sending notifications and file uploads to Slack channels
 */

import * as fs from 'fs';

import { WebClient } from '@slack/web-api';

import type { ReportData } from '../types/ReportData.js';

/**
 * Manages Slack notifications including messages and file uploads
 */
export class SlackNotifier {
  private readonly channel: string;
  private readonly client: WebClient;

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
    this.channel = channel;
    this.client = new WebClient(token);
  }

  /**
   * Replaces template placeholders with actual values
   * @param template - Message template with {{placeholder}} syntax
   * @param data - Data object containing placeholder values
   * @returns Formatted message string
   */
  private replacePlaceholders(template: string, data: ReportData): string {
    return Object.entries(data).reduce(
      (msg, [key, val]) => msg.replace(new RegExp(`{{${key}}}`, 'g'), String(val)),
      template
    );
  }

  /**
   * Sends a text message to the configured Slack channel
   * @param text - Message text (supports Slack markdown)
   * @returns Slack API response
   */
  public async sendMessage(text: string): Promise<unknown> {
    const result = await this.client.chat.postMessage({
      channel: this.channel,
      text,
      mrkdwn: true,
    });
    return result;
  }

  /**
   * Uploads a file to the configured Slack channel
   * @param filePath - Path to the file to upload
   * @param message - Initial comment to include with the file
   * @param fileName - Optional custom filename
   * @returns Slack API response
   * @throws Error if file does not exist
   */
  private async uploadFile(filePath: string, message: string, fileName?: string): Promise<unknown> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const actualFileName = fileName ?? filePath.split('/').pop();
    if (!actualFileName) {
      throw new Error('Could not determine filename');
    }

    const result = await this.client.files.uploadV2({
      channel_id: this.channel,
      file: fs.createReadStream(filePath),
      filename: actualFileName,
      title: actualFileName,
      initial_comment: message,
    });

    return result;
  }

  /**
   * Formats a report message using a template and data
   * @param template - Message template
   * @param data - Partial report data to merge with defaults
   * @returns Formatted message string
   */
  private formatReportMessage(template: string, data: Partial<ReportData>): string {
    const defaults: ReportData = {
      startDate: 'N/A',
      endDate: 'N/A',
      rowCount: 0,
      fileName: 'report.csv',
      analysis: 'No analysis available',
      timestamp: new Date().toISOString(),
    };
    return this.replacePlaceholders(template, { ...defaults, ...data } as ReportData);
  }

  /**
   * Sends a report to Slack, optionally with a CSV file attachment
   * @param messageTemplate - Message template for the report
   * @param reportData - Data to include in the report
   * @param csvFilePath - Optional path to CSV file to attach
   * @returns Slack API response
   */
  public async sendReport(
    messageTemplate: string,
    reportData: Partial<ReportData>,
    csvFilePath?: string | null
  ): Promise<unknown> {
    const message = this.formatReportMessage(messageTemplate, reportData);

    if (csvFilePath) {
      return this.uploadFile(csvFilePath, message, reportData.fileName);
    }

    const messageWithNote = `${message}\n\n_No attachment: query returned no results._`;
    return this.sendMessage(messageWithNote);
  }

  /**
   * Sends an error notification to Slack
   * @param errorMessage - Human-readable error description
   * @param error - Optional Error object for stack trace
   * @returns Slack API response
   */
  public async sendError(errorMessage: string, error?: Error): Promise<unknown> {
    const details = error ? `\n\n\`\`\`\n${error.stack ?? error.message}\n\`\`\`` : '';
    const message = `*Error during report execution*\n\n${errorMessage}${details}`;
    return this.sendMessage(message);
  }

  /**
   * Tests the Slack connection by calling auth.test
   * @returns True if connection is successful
   * @throws Error if authentication fails
   */
  public async testConnection(): Promise<boolean> {
    await this.client.auth.test();
    return true;
  }
}
