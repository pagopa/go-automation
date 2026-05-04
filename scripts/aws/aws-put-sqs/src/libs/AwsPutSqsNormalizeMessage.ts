/**
 * AWS Put SQS - Normalize Message
 */

/**
 * Normalize message for SQS
 * @param message - Message to normalize
 * @returns Normalized message as string or null if invalid
 */
export function normalizeMessage(message: unknown): string | null {
  if (typeof message === 'string') return message;
  if (message !== null && message !== undefined) return JSON.stringify(message);
  return null;
}
