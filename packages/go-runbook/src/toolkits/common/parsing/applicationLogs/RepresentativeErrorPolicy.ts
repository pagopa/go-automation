/**
 * How a scanner picks the representative error of a service (EVO-RBREORG-OPUS-01 P32):
 * - `latest`: the most recent error- or warn-level message, else the most recent
 *   level-less message with an error keyword (rows are chronological);
 * - `longest`: the longest error- or warn-level message, else the longest message
 *   with an error keyword among level-less and error-level rows.
 */
export type RepresentativeErrorPolicy = 'latest' | 'longest';
