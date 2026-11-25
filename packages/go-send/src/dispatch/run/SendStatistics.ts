/**
 * Timing of the send phase, from the journaled `sentAt` of the rows (§12.4).
 */
export interface SendStatistics {
  readonly sent: number;
  readonly firstSentAt?: string;
  readonly lastSentAt?: string;
  /** Sent rows per second between the first and the last send. */
  readonly averageRate?: number;
}
