import type { TraceIdCandidateMatch } from './TraceIdCandidateMatch.js';

/**
 * A kind of tracing id the logs write: how a direct value is recognized and put in canonical form, the forms a query
 * looks it up in, the tokens that name it in a message, and where a message carries one to discover.
 */
export interface TraceIdFormat {
  readonly name: string;
  parse(value: string): string | undefined;
  searchForms(canonical: string): ReadonlyArray<string>;
  readonly messageTokens: RegExp;
  findInMessage(message: string): TraceIdCandidateMatch | undefined;
}
