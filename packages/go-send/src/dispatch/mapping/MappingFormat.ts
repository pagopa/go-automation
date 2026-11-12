/**
 * Input format hints of a mapping profile.
 */
export interface MappingFormat {
  readonly type?: 'csv' | 'json' | 'jsonl';
  /** CSV delimiter (default `,`). */
  readonly delimiter?: string;
  /** CSV lines to skip before the header (default `0`). */
  readonly skipRows?: number;
  readonly encoding?: BufferEncoding;
}
