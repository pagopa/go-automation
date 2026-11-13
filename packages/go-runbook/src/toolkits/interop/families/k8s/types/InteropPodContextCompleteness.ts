/**
 * When an INTEROP pod context counts as incomplete: at the row limit, or also
 * when CloudWatch matched more records than it returned (EVO-RBREORG-OPUS-01 P30).
 */
export type InteropPodContextCompleteness = 'row-limit' | 'row-limit-or-unreturned-matches';
