/**
 * SQS Visibility Heartbeat
 *
 * Utility to periodically extend the visibility timeout of in-flight messages.
 */

import type { SQSClient } from '@aws-sdk/client-sqs';
import { ChangeMessageVisibilityBatchCommand } from '@aws-sdk/client-sqs';

/**
 * Manages heartbeat extension for a set of SQS messages.
 */
export class SQSVisibilityHeartbeat {
  private interval: NodeJS.Timeout | undefined;
  private readonly receiptHandles: Set<string>;

  /**
   * @param sqsClient - AWS SQS Client
   * @param queueUrl - Queue URL
   * @param visibilityTimeout - New visibility timeout to set on each heartbeat (seconds)
   * @param heartbeatIntervalSeconds - How often to send the heartbeat (seconds)
   */
  constructor(
    private readonly sqsClient: SQSClient,
    private readonly queueUrl: string,
    private readonly visibilityTimeout: number,
    private readonly heartbeatIntervalSeconds: number,
  ) {
    this.receiptHandles = new Set();
  }

  /**
   * Adds handles to the heartbeat manager.
   *
   * @param handles - Receipt handles to track
   */
  addHandles(handles: string[]): void {
    for (const handle of handles) {
      this.receiptHandles.add(handle);
    }
  }

  /**
   * Removes a handle (e.g., after it was deleted or released).
   *
   * @param handle - Receipt handle to stop tracking
   */
  removeHandle(handle: string): void {
    this.receiptHandles.delete(handle);
  }

  /**
   * Starts the heartbeat loop.
   */
  start(): void {
    if (this.interval) return;

    this.interval = setInterval(() => {
      void this.pulse();
    }, this.heartbeatIntervalSeconds * 1000);
  }

  /**
   * Stops the heartbeat loop.
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  /**
   * Performs a single heartbeat pulse (extends visibility for all tracked handles).
   */
  private async pulse(): Promise<void> {
    const handles = Array.from(this.receiptHandles);
    if (handles.length === 0) return;

    // SQS Batch limit is 10
    for (let i = 0; i < handles.length; i += 10) {
      const batch = handles.slice(i, i + 10);
      try {
        await this.sqsClient.send(
          new ChangeMessageVisibilityBatchCommand({
            QueueUrl: this.queueUrl,
            Entries: batch.map((handle, index) => ({
              Id: `hb-${index}`,
              ReceiptHandle: handle,
              VisibilityTimeout: this.visibilityTimeout,
            })),
          }),
        );
      } catch (_error) {
        // We don't want the heartbeat to crash the main process, just log it if possible.
      }
    }
  }
}
