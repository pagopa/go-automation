/**
 * SQS Utilities
 */

/** Max batch size for SQS operations */
export const SQS_MAX_BATCH_SIZE = 10;

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
}
