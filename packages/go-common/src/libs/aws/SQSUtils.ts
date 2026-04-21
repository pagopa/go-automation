/**
 * SQS Utilities
 */

/** Max batch size for SQS operations */
export const SQS_MAX_BATCH_SIZE = 10;

/** Max payload size for SQS (256KB) */
export const SQS_MAX_PAYLOAD_BYTES: number = 256 * 1024;

/**
 * SQS Utilities class
 */
export class SQSUtils {
  /**
   * Chunks an array into batches suitable for SQS operations (max 10 items).
   *
   * @template T - The type of items in the array
   * @param items - The array to chunk
   * @param batchSize - Optional custom batch size (max 10)
   * @returns An array of batches
   */
  static chunkForSQS<T>(items: T[], batchSize: number = SQS_MAX_BATCH_SIZE): T[][] {
    const effectiveBatchSize = Math.min(batchSize, SQS_MAX_BATCH_SIZE);
    const chunks: T[][] = [];

    for (let i = 0; i < items.length; i += effectiveBatchSize) {
      chunks.push(items.slice(i, i + effectiveBatchSize));
    }

    return chunks;
  }

  /**
   * Validates that a message body is within SQS size limits.
   *
   * @param body - Message body string
   * @throws Error if the body exceeds SQS limits
   */
  static validateMessageSize(body: string): void {
    const size = Buffer.byteLength(body, 'utf8');
    if (size > SQS_MAX_PAYLOAD_BYTES) {
      throw new Error(`Message size (${size} bytes) exceeds SQS limit of ${SQS_MAX_PAYLOAD_BYTES} bytes`);
    }
    if (size === 0) {
      throw new Error('Message body cannot be empty');
    }
  }
}
