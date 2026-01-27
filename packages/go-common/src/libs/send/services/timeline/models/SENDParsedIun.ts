/**
 * SEND Parsed IUN - Represents an IUN with optional date filter
 */

/**
 * Represents a parsed IUN that may include a date filter
 *
 * Format: IUN or IUN|DATE (where DATE filters timeline elements)
 *
 * @example
 * ```typescript
 * // Simple IUN
 * const iun: SENDParsedIun = { iun: 'ABCD-1234-5678', dateFilter: null };
 *
 * // IUN with date filter
 * const filtered: SENDParsedIun = { iun: 'ABCD-1234-5678', dateFilter: '2024-01-15' };
 * ```
 */
export interface SENDParsedIun {
  /** The IUN (Identificativo Univoco Notifica) */
  readonly iun: string;

  /** Optional date filter (YYYY-MM-DD format) - only include elements on or after this date */
  readonly dateFilter: string | null;
}
