import { boundedText } from '../parsing/correlation/boundedText.js';

/** Longest label of an error node. */
const MAX_LABEL = 160;

/**
 * The label of an error node: the first line of its message, bounded, or the fallback when the message is empty.
 *
 * @param message - Message of the node
 * @param fallback - Label of a node without message
 * @returns The label
 *
 * @example
 * ```typescript
 * errorNodeLabel('TimeoutError: read timed out\n    at Socket'); // 'TimeoutError: read timed out'
 * errorNodeLabel('', 'invocazione in errore'); // 'invocazione in errore'
 * ```
 */
export function errorNodeLabel(message: string, fallback = 'errore senza messaggio'): string {
  return boundedText(message.split('\n')[0] ?? '', MAX_LABEL) || fallback;
}
