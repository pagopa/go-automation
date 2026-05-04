/**
 * Statistics for the bulk operation
 */
export interface BulkStats {
  /**
   * The number of processed messages.
   * @type {number}
   */
  processed: number;

  /**
   * The number of successfully sent messages.
   * @type {number}
   */
  success: number;

  /**
   * The number of failed messages.
   * @type {number}
   */
  failed: number;

  /**
   * The number of retries performed.
   * @type {number}
   */
  retries: number;
}
