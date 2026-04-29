/**
 * AWS SQS Service
 *
 * Provides methods for SQS operations including DLQ inspection,
 * queue metadata resolution, and resilient batch sending.
 */

import * as crypto from 'node:crypto';
import {
  ChangeMessageVisibilityBatchCommand,
  DeleteMessageBatchCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ListQueuesCommand,
  ReceiveMessageCommand,
  SendMessageBatchCommand,
} from '@aws-sdk/client-sqs';
import type {
  SQSClient,
  SendMessageBatchRequestEntry,
  SendMessageBatchResultEntry,
  SendMessageBatchCommandOutput,
  MessageAttributeValue,
  QueueAttributeName,
  Message,
  DeleteMessageBatchCommandOutput,
  ChangeMessageVisibilityBatchCommandOutput,
} from '@aws-sdk/client-sqs';
import { GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import type { CloudWatchClient } from '@aws-sdk/client-cloudwatch';

import type { DLQStats } from './models/DLQStats.js';
import type { SQSBatchSendRetryOptions } from './models/SQSBatchSendRetryOptions.js';
import type { SQSMessageHandler } from './models/SQSHandlers.js';
import type { SQSMoveCallbacks } from './models/SQSMoveCallbacks.js';
import type { SQSMoveError } from './models/SQSMoveError.js';
import type { SQSMoveOptions } from './models/SQSMoveOptions.js';
import type { SQSMoveResult } from './models/SQSMoveResult.js';
import { SQSProcessAction } from './models/SQSProcessAction.js';
import type { SQSProcessCallbacks } from './models/SQSProcessCallbacks.js';
import type { SQSProcessOptions } from './models/SQSProcessOptions.js';
import type { SQSProcessResult } from './models/SQSProcessResult.js';
import type { SQSQueueMetadata } from './models/SQSQueueMetadata.js';
import type { SQSReceiveCallbacks } from './models/SQSReceiveCallbacks.js';
import { SQSReceiveDeduplicationMode } from './models/SQSReceiveDeduplicationMode.js';
import type { SQSReceiveOptions } from './models/SQSReceiveOptions.js';
import type { SQSReceiveResult } from './models/SQSReceiveResult.js';
import { SQS_MAX_BATCH_SIZE } from './SQSUtils.js';

/** Time window for CloudWatch metrics (5 minutes) */
const CLOUDWATCH_WINDOW_MS = 5 * 60 * 1000;

/** CloudWatch period in seconds */
const CLOUDWATCH_PERIOD_SECONDS = 300;

/** Seconds in a day */
const SECONDS_PER_DAY = 24 * 60 * 60;

/** Max results per ListQueues page */
const LIST_QUEUES_PAGE_SIZE = 1000;

/** Default batch retry delay (ms) */
const DEFAULT_RETRY_DELAY_MS = 500;

/** Long polling wait time in seconds */
const LONG_POLLING_WAIT_TIME = 20;

/**
 * Strict regex for SQS queue URLs. Accepts the canonical form:
 *   https://sqs.<region>.amazonaws.com/<accountId>/<queueName>[.fifo]
 * Refuses arbitrary HTTPS URLs to avoid sending requests to attacker-controlled hosts
 * or accidentally hitting non-SQS AWS endpoints.
 */
const SQS_URL_REGEX = /^https:\/\/sqs\.[a-z0-9-]+\.amazonaws\.com\/\d+\/[A-Za-z0-9_-]+(\.fifo)?$/;

/**
 * A message paired with its ReceiptHandle, ready to be deleted from the source queue.
 * Used internally by `moveMessages` to keep the delete batch indices aligned with the
 * underlying source messages (so failure reports can map back to the correct MessageId).
 */
interface DeletableMessage {
  readonly message: Message;
  readonly receiptHandle: string;
}

/**
 * Service for interacting with Amazon SQS.
 *
 * Provides high-level methods for common operational tasks like DLQ health
 * checks and robust bulk message sending.
 */
export class AWSSQSService {
  constructor(
    private readonly sqsClient: SQSClient,
    private readonly cloudWatchClient: CloudWatchClient,
  ) {}

  /**
   * Resolves queue metadata including URL, FIFO status, and message count.
   *
   * Accepts either a full queue URL or just the queue name.
   *
   * @param queueNameOrUrl - Queue name or URL
   * @returns Queue metadata
   */
  async resolveQueueMetadata(queueNameOrUrl: string): Promise<SQSQueueMetadata> {
    if (queueNameOrUrl.startsWith('https://') && !SQS_URL_REGEX.test(queueNameOrUrl)) {
      throw new Error(
        'Invalid SQS URL. Expected format: https://sqs.<region>.amazonaws.com/<accountId>/<queueName>',
      );
    }

    const queueUrl = queueNameOrUrl.startsWith('https://')
      ? queueNameOrUrl
      : (await this.sqsClient.send(new GetQueueUrlCommand({ QueueName: queueNameOrUrl }))).QueueUrl;

    if (!queueUrl) {
      throw new Error(`Could not resolve SQS queue URL for: ${queueNameOrUrl}`);
    }

    // FifoQueue attribute is only valid for FIFO queues (.fifo suffix is mandatory)
    const isLikelyFifo = queueUrl.endsWith('.fifo');
    const attributeNames: QueueAttributeName[] = isLikelyFifo
      ? ['ApproximateNumberOfMessages', 'FifoQueue']
      : ['ApproximateNumberOfMessages'];

    const response = await this.sqsClient.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: attributeNames,
      }),
    );

    return {
      queueUrl,
      isFifo: response.Attributes?.FifoQueue === 'true',
      approxMessages: parseInt(response.Attributes?.ApproximateNumberOfMessages ?? '0', 10),
    };
  }

  /**
   * Sends a batch of messages with surgical retries for partial failures.
   *
   * Only messages that failed in the previous attempt (reported in the `Failed` array)
   * are retried, preventing duplicates in standard queues.
   *
   * The returned response aggregates `Successful` entries across ALL attempts
   * (so callers can identify every entry that ever succeeded), while `Failed`
   * contains entries that never succeeded after the final attempt. Without this
   * aggregation, callers would see only the last attempt's response and miss
   * messages successfully sent in earlier batches — a critical correctness bug
   * for redrive scenarios where missing successes lead to source/target duplicates.
   *
   * @param queueUrl - Target queue URL
   * @param entries - Batch of message entries
   * @param options - Retry configuration
   * @returns Aggregated command output covering all attempts
   */
  async sendMessageBatchWithRetries(
    queueUrl: string,
    entries: ReadonlyArray<SendMessageBatchRequestEntry>,
    options: SQSBatchSendRetryOptions = { maxRetries: 3 },
  ): Promise<SendMessageBatchCommandOutput> {
    let currentEntries: ReadonlyArray<SendMessageBatchRequestEntry> = entries;
    let attempt = 0;
    let lastResponse: SendMessageBatchCommandOutput | undefined;
    const successfulById = new Map<string, SendMessageBatchResultEntry>();

    while (currentEntries.length > 0) {
      const response = await this.sqsClient.send(
        new SendMessageBatchCommand({
          QueueUrl: queueUrl,
          Entries: [...currentEntries],
        }),
      );

      lastResponse = response;

      for (const ok of response.Successful ?? []) {
        if (ok.Id !== undefined) {
          successfulById.set(ok.Id, ok);
        }
      }

      if (!response.Failed || response.Failed.length === 0) {
        break;
      }

      if (attempt < options.maxRetries) {
        attempt++;
        const failedIds = new Set(response.Failed.map((f) => f.Id).filter((id): id is string => !!id));
        currentEntries = currentEntries.filter((e) => e.Id !== undefined && failedIds.has(e.Id));

        options.onRetry?.(currentEntries.length, attempt);

        // Exponential backoff with jitter to avoid thundering herd on throttling
        const delay = (2 ** attempt + Math.random()) * DEFAULT_RETRY_DELAY_MS;
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        break;
      }
    }

    if (!lastResponse) {
      throw new Error('No response received from SQS batch send');
    }

    return {
      ...lastResponse,
      Successful: [...successfulById.values()],
      Failed: lastResponse.Failed ?? [],
    };
  }

  /**
   * Deletes a batch of messages from a queue.
   *
   * @param queueUrl - Target queue URL
   * @param receiptHandles - List of receipt handles to delete
   * @returns Command output
   */
  async deleteMessageBatch(queueUrl: string, receiptHandles: string[]): Promise<DeleteMessageBatchCommandOutput> {
    if (receiptHandles.length === 0) {
      throw new Error('No receipt handles provided for deletion');
    }

    return await this.sqsClient.send(
      new DeleteMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: receiptHandles.map((handle, index) => ({
          Id: `msg-${index}`,
          ReceiptHandle: handle,
        })),
      }),
    );
  }

  /**
   * Changes the visibility timeout of a batch of messages.
   *
   * @param queueUrl - Target queue URL
   * @param entries - List of receipt handles and their new visibility timeout
   * @returns Command output
   */
  async changeMessageVisibilityBatch(
    queueUrl: string,
    entries: { receiptHandle: string; visibilityTimeout: number }[],
  ): Promise<ChangeMessageVisibilityBatchCommandOutput> {
    if (entries.length === 0) {
      throw new Error('No entries provided for visibility change');
    }

    return await this.sqsClient.send(
      new ChangeMessageVisibilityBatchCommand({
        QueueUrl: queueUrl,
        Entries: entries.map((e, index) => ({
          Id: `msg-${index}`,
          ReceiptHandle: e.receiptHandle,
          VisibilityTimeout: e.visibilityTimeout,
        })),
      }),
    );
  }

  /**
   * Receives messages from a queue in bulk using long polling and deduplication.
   *
   * @param options - Receive configuration
   * @param callbacks - Optional progress callbacks
   * @returns Reception results including unique messages
   */
  async receiveMessages(options: SQSReceiveOptions, callbacks?: SQSReceiveCallbacks): Promise<SQSReceiveResult> {
    let totalReceived = 0;
    let totalUnique = 0;
    let totalDuplicates = 0;
    let consecutiveEmptyReceives = 0;
    const seenKeys = new Set<string>();
    const uniqueMessages: Message[] = [];

    while (consecutiveEmptyReceives < options.maxEmptyReceives) {
      if (options.limit !== undefined && totalUnique >= options.limit) {
        break;
      }

      const nextBatchSize =
        options.limit !== undefined ? Math.min(SQS_MAX_BATCH_SIZE, options.limit - totalUnique) : SQS_MAX_BATCH_SIZE;

      const receiveResponse = await this.sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: options.queueUrl,
          MaxNumberOfMessages: nextBatchSize,
          VisibilityTimeout: options.visibilityTimeout,
          WaitTimeSeconds: LONG_POLLING_WAIT_TIME,
          AttributeNames: ['All'],
          MessageAttributeNames: ['All'],
        }),
      );

      const messages = receiveResponse.Messages ?? [];

      if (messages.length === 0) {
        consecutiveEmptyReceives++;
        callbacks?.onEmptyReceive?.(consecutiveEmptyReceives, options.maxEmptyReceives);
        continue;
      }

      let newMessagesInBatch = 0;
      for (const message of messages) {
        const dedupKey = this.getReceiveDedupKey(message, options.dedupMode);
        const isDuplicate = dedupKey !== undefined && seenKeys.has(dedupKey);

        if (dedupKey !== undefined && !isDuplicate) {
          seenKeys.add(dedupKey);
        }

        if (isDuplicate) {
          totalDuplicates++;
        } else {
          uniqueMessages.push(message);
          totalUnique++;
          newMessagesInBatch++;
        }
      }

      totalReceived += messages.length;

      if (newMessagesInBatch > 0) {
        consecutiveEmptyReceives = 0;
      } else {
        consecutiveEmptyReceives++;
      }

      callbacks?.onProgress?.(totalUnique, totalReceived, totalDuplicates);
    }

    const stopReason =
      options.limit !== undefined && totalUnique >= options.limit
        ? 'reached limit'
        : `queue empty after ${options.maxEmptyReceives} polls`;

    return { messages: uniqueMessages, totalReceived, totalUnique, totalDuplicates, stopReason };
  }

  /**
   * Consumes and processes messages from a queue in a resilient loop.
   *
   * Automatically handles:
   * - Long polling (WaitTimeSeconds = 20)
   * - Batch deletion (DELETE action)
   * - Batch visibility reset (RELEASE action)
   * - Progress tracking
   *
   * @param options - Loop configuration
   * @param processor - Callback for each message returning the action to take
   * @param callbacks - Optional progress callbacks
   * @returns Processing statistics
   */
  async processMessages(
    options: SQSProcessOptions,
    processor: SQSMessageHandler,
    callbacks?: SQSProcessCallbacks,
  ): Promise<SQSProcessResult> {
    let totalReceived = 0;
    let totalDeleted = 0;
    let totalReleased = 0;
    let totalSkipped = 0;
    let consecutiveEmptyReceives = 0;

    const waitTime = options.waitTimeSeconds ?? LONG_POLLING_WAIT_TIME;

    while (consecutiveEmptyReceives < options.maxEmptyReceives) {
      if (options.limit !== undefined && totalReceived >= options.limit) {
        break;
      }

      const nextBatchSize =
        options.limit !== undefined ? Math.min(SQS_MAX_BATCH_SIZE, options.limit - totalReceived) : SQS_MAX_BATCH_SIZE;

      const receiveResponse = await this.sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: options.queueUrl,
          MaxNumberOfMessages: nextBatchSize,
          VisibilityTimeout: options.visibilityTimeout,
          WaitTimeSeconds: waitTime,
          AttributeNames: ['All'],
          MessageAttributeNames: ['All'],
        }),
      );

      const messages = receiveResponse.Messages ?? [];

      if (messages.length === 0) {
        consecutiveEmptyReceives++;
        callbacks?.onEmptyReceive?.(consecutiveEmptyReceives, options.maxEmptyReceives);
        continue;
      }

      consecutiveEmptyReceives = 0;
      totalReceived += messages.length;

      const toDelete: string[] = [];
      const toRelease: string[] = [];

      for (const message of messages) {
        const action = await processor(message);

        switch (action) {
          case SQSProcessAction.DELETE:
            if (message.ReceiptHandle) toDelete.push(message.ReceiptHandle);
            totalDeleted++;
            break;
          case SQSProcessAction.RELEASE:
            if (message.ReceiptHandle) toRelease.push(message.ReceiptHandle);
            totalReleased++;
            break;
          case SQSProcessAction.SKIP:
            totalSkipped++;
            break;
          default:
            totalSkipped++;
            break;
        }
      }

      // Execute batch actions
      if (toDelete.length > 0) {
        await this.deleteMessageBatch(options.queueUrl, toDelete);
      }
      if (toRelease.length > 0) {
        await this.changeMessageVisibilityBatch(
          options.queueUrl,
          toRelease.map((h) => ({ receiptHandle: h, visibilityTimeout: 0 })),
        );
      }

      callbacks?.onProgress?.(totalReceived, totalDeleted, totalReleased, totalSkipped);
    }

    const stopReason =
      options.limit !== undefined && totalReceived >= options.limit
        ? 'reached limit'
        : `queue empty after ${options.maxEmptyReceives} polls`;

    return { totalReceived, totalDeleted, totalReleased, totalSkipped, stopReason };
  }

  /**
   * Moves messages from one queue to another.
   *
   * Behaviour highlights:
   * - **Defensive guard**: throws if source and target are the same queue (prevents
   *   accidental redrive loops).
   * - **Validation**: rejects empty bodies and FIFO messages without `MessageGroupId`
   *   (collected into `result.errors` with stage `'validation'`, not silently
   *   substituted with placeholder values).
   * - **Reserved attribute filter**: drops `MessageAttributes` with the `AWS.`
   *   prefix to avoid SDK send failures.
   * - **Dry-run safety**: receives with `VisibilityTimeout: 0` so messages are
   *   immediately visible again to other consumers; deduplicates via `MessageId`
   *   to avoid double-counting on re-receive.
   * - **Separated counters**: distinguishes `totalSendFailed` (still on source —
   *   safe) from `totalDeleteFailed` (sent to target but not deleted from source —
   *   duplicates at risk on next consumer poll) so the operator knows what's at risk.
   * - **No silent error swallowing**: unexpected exceptions are captured into
   *   `result.errors` with stage `'unknown'` and propagated via `onError`.
   *
   * @param options - Move configuration
   * @param callbacks - Optional progress, empty-receive, and error callbacks
   * @returns Move statistics including per-message errors
   */
  async moveMessages(options: SQSMoveOptions, callbacks?: SQSMoveCallbacks): Promise<SQSMoveResult> {
    if (options.sourceQueueUrl === options.targetQueueUrl) {
      throw new Error(
        `Source and target are the same queue (${options.sourceQueueUrl}). Refusing to redrive to avoid an infinite loop.`,
      );
    }

    let totalMoved = 0;
    let totalSendFailed = 0;
    let totalDeleteFailed = 0;
    let totalValidationFailed = 0;
    let stopReason = '';
    let stopRequested = false;
    const errors: SQSMoveError[] = [];
    const seenMessageIds = new Set<string>();
    const maxEmptyReceives = options.maxEmptyReceives ?? 3;
    const concurrency = Math.max(1, options.concurrency ?? 1);

    const reportError = (error: SQSMoveError): void => {
      errors.push(error);
      callbacks?.onError?.(error);
    };

    const reportProgress = (): void => {
      callbacks?.onProgress?.(totalMoved, totalSendFailed, totalDeleteFailed, totalValidationFailed);
    };

    // Worker pipeline: receive → (validate, send, delete). With concurrency=1 this
    // is functionally identical to the original sequential loop; with concurrency>N
    // multiple workers run independently and share the counters/error list.
    //
    // Note: with concurrency > 1 the `limit` is approximate — racing workers may
    // collectively receive up to `(concurrency - 1) * batchSize` extra messages
    // before the limit check triggers `stopRequested`. Acceptable for an automation
    // tool; document on the option if the trade-off matters for a caller.
    const worker = async (): Promise<void> => {
      let consecutiveEmptyReceives = 0;

      while (!stopRequested && consecutiveEmptyReceives < maxEmptyReceives) {
        if (options.limit !== undefined && totalMoved >= options.limit) {
          if (stopReason === '') stopReason = 'reached limit';
          stopRequested = true;
          return;
        }

        const remainingBudget = options.limit !== undefined ? options.limit - totalMoved : SQS_MAX_BATCH_SIZE;
        const nextBatchSize = Math.min(SQS_MAX_BATCH_SIZE, options.batchSize, remainingBudget);

        if (nextBatchSize <= 0) {
          if (stopReason === '') stopReason = 'batch size depleted';
          stopRequested = true;
          return;
        }

        // In dry-run, force VisibilityTimeout: 0 so the simulation does not hide
        // messages from real consumers. Deduplication via MessageId then prevents
        // counting the same message twice when it reappears on the next poll.
        const effectiveVisibilityTimeout = options.dryRun ? 0 : options.visibilityTimeout;

        const receiveResponse = await this.sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: options.sourceQueueUrl,
            MaxNumberOfMessages: nextBatchSize,
            VisibilityTimeout: effectiveVisibilityTimeout,
            WaitTimeSeconds: LONG_POLLING_WAIT_TIME,
            AttributeNames: ['All'],
            MessageAttributeNames: ['All'],
          }),
        );

        const rawMessages = receiveResponse.Messages ?? [];

        // In dry-run, deduplicate by MessageId so we count each unique message once
        // even if it reappears when its (zero) visibility window has elapsed.
        const messages = options.dryRun
          ? rawMessages.filter((m) => {
              if (m.MessageId === undefined) return true;
              if (seenMessageIds.has(m.MessageId)) return false;
              seenMessageIds.add(m.MessageId);
              return true;
            })
          : rawMessages;

        if (rawMessages.length === 0) {
          consecutiveEmptyReceives++;
          callbacks?.onEmptyReceive?.(consecutiveEmptyReceives, maxEmptyReceives);
          continue;
        }

        // If everything in this batch was a duplicate (dry-run only), still treat as
        // "no new progress" so the loop terminates after maxEmptyReceives.
        if (messages.length === 0) {
          consecutiveEmptyReceives++;
          callbacks?.onEmptyReceive?.(consecutiveEmptyReceives, maxEmptyReceives);
          continue;
        }

        consecutiveEmptyReceives = 0;

        if (options.dryRun) {
          totalMoved += messages.length;
          reportProgress();
          continue;
        }

        // Build entries, validating per message. Validation failures are reported
        // as errors and excluded from the send batch (they remain on source).
        const entries: SendMessageBatchRequestEntry[] = [];
        const entryToMessage = new Map<string, Message>();

        for (const [index, msg] of messages.entries()) {
          const entryId = `msg-${index}`;

          if (msg.Body === undefined || msg.Body.length === 0) {
            totalValidationFailed++;
            reportError({
              stage: 'validation',
              ...(msg.MessageId !== undefined && { messageId: msg.MessageId }),
              error: 'Message body is empty (SQS rejects empty bodies)',
            });
            continue;
          }

          if (options.isFifo && msg.Attributes?.MessageGroupId === undefined) {
            totalValidationFailed++;
            reportError({
              stage: 'validation',
              ...(msg.MessageId !== undefined && { messageId: msg.MessageId }),
              error: 'FIFO message is missing MessageGroupId',
            });
            continue;
          }

          const filteredAttributes = this.filterReservedAttributes(msg.MessageAttributes);

          const entry: SendMessageBatchRequestEntry = {
            Id: entryId,
            MessageBody: msg.Body,
            ...(filteredAttributes !== undefined && { MessageAttributes: filteredAttributes }),
          };

          if (options.isFifo) {
            // Safe: validated above
            entry.MessageGroupId = msg.Attributes?.MessageGroupId;
            entry.MessageDeduplicationId =
              msg.Attributes?.MessageDeduplicationId ?? this.computeMessageFingerprint(msg.Body);
          }

          entries.push(entry);
          entryToMessage.set(entryId, msg);
        }

        if (entries.length === 0) {
          // All messages in this batch were rejected by validation. Continue
          // loop — they remain on source and will hit the visibility timeout.
          reportProgress();
          continue;
        }

        let sendResponse: SendMessageBatchCommandOutput;
        try {
          sendResponse = await this.sendMessageBatchWithRetries(options.targetQueueUrl, entries);
        } catch (err) {
          // Unexpected error from the AWS SDK (throttling, IAM, KMS, network, ...).
          // We don't know which messages were sent — assume none. They remain on
          // source (safe) but the operator must be aware via onError.
          const message = err instanceof Error ? err.message : String(err);
          totalSendFailed += entries.length;
          for (const entry of entries) {
            const sourceMessage = entryToMessage.get(entry.Id ?? '');
            reportError({
              stage: 'unknown',
              ...(sourceMessage?.MessageId !== undefined && { messageId: sourceMessage.MessageId }),
              error: `SendMessageBatch threw: ${message}`,
            });
          }
          reportProgress();
          continue;
        }

        const successfulIds = new Set(
          (sendResponse.Successful ?? []).map((s) => s.Id).filter((id): id is string => id !== undefined),
        );
        const sendFailedEntries = sendResponse.Failed ?? [];

        // Capture send failures explicitly
        for (const failure of sendFailedEntries) {
          const sourceMessage = failure.Id !== undefined ? entryToMessage.get(failure.Id) : undefined;
          reportError({
            stage: 'send',
            ...(sourceMessage?.MessageId !== undefined && { messageId: sourceMessage.MessageId }),
            error: `[${failure.Code ?? 'Unknown'}] ${failure.Message ?? 'send failed'}`,
          });
        }
        totalSendFailed += sendFailedEntries.length;

        // Messages successfully sent to target. Each must now be deleted from source —
        // failing to do so leaves a duplicate (delivered to target AND still on source).
        const sentMessages = entries
          .filter((entry) => entry.Id !== undefined && successfulIds.has(entry.Id))
          .map((entry) => entryToMessage.get(entry.Id ?? ''))
          .filter((m): m is Message => m !== undefined);

        if (sentMessages.length === 0) {
          reportProgress();
          continue;
        }

        // Partition sent messages by ReceiptHandle availability. Pairing message+handle
        // up-front keeps the delete batch indices stable for accurate failure mapping.
        const deletable: DeletableMessage[] = [];
        const orphans: Message[] = [];
        for (const message of sentMessages) {
          if (message.ReceiptHandle !== undefined) {
            deletable.push({ message, receiptHandle: message.ReceiptHandle });
          } else {
            orphans.push(message);
          }
        }

        // Orphans were sent to target but cannot be deleted from source (no handle).
        // They count as delete failures because the duplicate-at-risk semantics apply.
        for (const orphan of orphans) {
          reportError({
            stage: 'delete',
            ...(orphan.MessageId !== undefined && { messageId: orphan.MessageId }),
            error:
              'Message sent to target but no ReceiptHandle available — cannot delete from source (duplicate at risk)',
          });
        }
        totalDeleteFailed += orphans.length;

        if (deletable.length === 0) {
          reportProgress();
          continue;
        }

        const receiptHandles = deletable.map((item) => item.receiptHandle);

        try {
          const deleteResponse = await this.deleteMessageBatch(options.sourceQueueUrl, receiptHandles);

          const failedDeleteIds = new Set(deleteResponse.Failed?.map((f) => f.Id));
          const deletedCount = deletable.length - failedDeleteIds.size;
          totalMoved += deletedCount;

          // Delete-failed messages are CRITICAL: sent to target but still on source.
          // They will be redelivered on the next consumer poll → duplicates at risk.
          for (const failure of deleteResponse.Failed ?? []) {
            // Synthetic id `msg-${index}` is generated against `receiptHandles`, which is
            // 1:1 with `deletable` by construction → indexing back into `deletable` is safe.
            const idxMatch = failure.Id?.match(/^msg-(\d+)$/);
            const idx = idxMatch !== null && idxMatch !== undefined ? Number(idxMatch[1]) : -1;
            const sourceMessage = idx >= 0 ? deletable[idx]?.message : undefined;
            reportError({
              stage: 'delete',
              ...(sourceMessage?.MessageId !== undefined && { messageId: sourceMessage.MessageId }),
              error: `[${failure.Code ?? 'Unknown'}] ${failure.Message ?? 'delete failed'} — message exists on BOTH source and target (duplicate at risk)`,
            });
          }
          totalDeleteFailed += failedDeleteIds.size;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          totalDeleteFailed += deletable.length;
          for (const item of deletable) {
            reportError({
              stage: 'delete',
              ...(item.message.MessageId !== undefined && { messageId: item.message.MessageId }),
              error: `DeleteMessageBatch threw: ${message} — message exists on BOTH source and target (duplicate at risk)`,
            });
          }
        }

        reportProgress();
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    if (stopReason === '') {
      stopReason = `queue empty after ${maxEmptyReceives} consecutive empty polls per worker`;
    }

    const totalFailed = totalSendFailed + totalDeleteFailed + totalValidationFailed;

    return {
      totalMoved,
      totalFailed,
      totalSendFailed,
      totalDeleteFailed,
      totalValidationFailed,
      errors,
      stopReason,
    };
  }

  /**
   * Removes message attributes whose name starts with `AWS.` (reserved namespace).
   * Returns undefined if the input is undefined OR if no usable attributes remain.
   */
  private filterReservedAttributes(
    attributes: Record<string, MessageAttributeValue> | undefined,
  ): Record<string, MessageAttributeValue> | undefined {
    if (attributes === undefined) {
      return undefined;
    }
    const filtered: Record<string, MessageAttributeValue> = {};
    let kept = 0;
    for (const [key, value] of Object.entries(attributes)) {
      if (key.startsWith('AWS.')) continue;
      filtered[key] = value;
      kept++;
    }
    return kept > 0 ? filtered : undefined;
  }

  /**
   * Computes a SHA-256 fingerprint of a message body.
   * Useful for MessageDeduplicationId in FIFO queues.
   *
   * @param body - Message body
   * @returns Hex digest of the body hash
   */
  computeMessageFingerprint(body: string): string {
    return crypto.createHash('sha256').update(body).digest('hex');
  }

  /**
   * Extracts the deduplication key from a received message.
   */
  private getReceiveDedupKey(message: Message, dedupMode: SQSReceiveDeduplicationMode): string | undefined {
    switch (dedupMode) {
      case SQSReceiveDeduplicationMode.MESSAGE_ID:
        return message.MessageId;
      case SQSReceiveDeduplicationMode.CONTENT_MD5:
        return `${message.MD5OfBody ?? ''}:${message.MD5OfMessageAttributes ?? ''}`;
      case SQSReceiveDeduplicationMode.NONE:
        return undefined;
      default:
        return undefined;
    }
  }

  /**
   * Lists all DLQs in the account that contain messages, with statistics.
   *
   * Fetches all queues whose name contains "DLQ", then for each one:
   * - Reads `ApproximateNumberOfMessages` from SQS attributes
   * - If messages > 0, reads `ApproximateAgeOfOldestMessage` from CloudWatch
   *
   * Complexity: O(N) where N is the number of DLQs with messages
   *
   * @returns Array of DLQ statistics, sorted by queue name
   */
  async listDLQsWithStats(): Promise<ReadonlyArray<DLQStats>> {
    const dlqUrls = await this.listAllDLQUrls();
    const results: DLQStats[] = [];

    for (const queueUrl of dlqUrls) {
      const queueName = queueUrl.substring(queueUrl.lastIndexOf('/') + 1);
      const messageCount = await this.getQueueMessageCount(queueUrl);

      if (messageCount > 0) {
        const ageOfOldestMessageDays = await this.getAgeOfOldestMessageDays(queueName);
        results.push({ queueName, queueUrl, messageCount, ageOfOldestMessageDays });
      }
    }

    return results.sort((a, b) => a.queueName.localeCompare(b.queueName));
  }

  /**
   * Lists all SQS queue URLs whose name contains "DLQ".
   * Handles pagination automatically.
   *
   * @returns Sorted array of DLQ queue URLs
   */
  private async listAllDLQUrls(): Promise<ReadonlyArray<string>> {
    const urls: string[] = [];
    let nextToken: string | undefined;

    do {
      const command = new ListQueuesCommand({
        QueueNamePrefix: '',
        MaxResults: LIST_QUEUES_PAGE_SIZE,
        NextToken: nextToken,
      });
      const response = await this.sqsClient.send(command);

      const dlqs = (response.QueueUrls ?? []).filter((url) => url.includes('DLQ'));
      urls.push(...dlqs);
      nextToken = response.NextToken;
    } while (nextToken !== undefined);

    return urls;
  }

  /**
   * Gets the approximate number of messages in a queue.
   *
   * @param queueUrl - Full SQS queue URL
   * @returns Approximate message count, or 0 if attribute is unavailable
   */
  private async getQueueMessageCount(queueUrl: string): Promise<number> {
    const command = new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages'],
    });
    const response = await this.sqsClient.send(command);
    const raw = response.Attributes?.['ApproximateNumberOfMessages'];
    return raw !== undefined ? parseInt(raw, 10) : 0;
  }

  /**
   * Gets the age of the oldest message in a queue (in days) from CloudWatch.
   *
   * Queries `ApproximateAgeOfOldestMessage` metric for the last 5 minutes
   * and returns the maximum value converted from seconds to days.
   *
   * @param queueName - SQS queue name (not the URL)
   * @returns Age in days, or undefined if no CloudWatch datapoints are available
   */
  private async getAgeOfOldestMessageDays(queueName: string): Promise<number | undefined> {
    const endTime = new Date();
    const startTime = new Date(Date.now() - CLOUDWATCH_WINDOW_MS);

    const command = new GetMetricStatisticsCommand({
      Namespace: 'AWS/SQS',
      MetricName: 'ApproximateAgeOfOldestMessage',
      Dimensions: [{ Name: 'QueueName', Value: queueName }],
      StartTime: startTime,
      EndTime: endTime,
      Period: CLOUDWATCH_PERIOD_SECONDS,
      Statistics: ['Maximum'],
      Unit: 'Seconds',
    });

    const response = await this.cloudWatchClient.send(command);

    if (response.Datapoints === undefined || response.Datapoints.length === 0) {
      return undefined;
    }

    const maxSeconds = response.Datapoints.reduce((max, dp) => Math.max(max, dp.Maximum ?? 0), 0);
    return Math.floor(maxSeconds / SECONDS_PER_DAY);
  }
}
