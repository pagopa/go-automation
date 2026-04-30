/**
 * Supported input file formats for partition key lists
 */
export type InputFormat = 'txt' | 'jsonl' | 'csv';

/**
 * Supported output formats for query results
 */
export type OutputFormat = 'dynamo-json' | 'json' | 'ndjson' | 'csv' | 'text';

/**
 * Failure handling policy for multi-key DynamoDB queries.
 */
export const FAILURE_MODES = ['abort', 'report', 'ignore'] as const;

type FailureMode = (typeof FAILURE_MODES)[number];

export function isFailureMode(value: string): value is FailureMode {
  return (FAILURE_MODES as ReadonlyArray<string>).includes(value);
}

/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface AwsQueryDynamodbConfig {
  /** AWS profile name for SSO authentication */
  readonly awsProfile: string;

  /** Input PK file path (optional if inputPks is provided) */
  readonly inputFile?: string;

  /** List of PKs to query (CLI input, optional if inputFile is provided) */
  readonly inputPks?: ReadonlyArray<string>;

  /** Input file format: txt (one PK per line), jsonl (one JSON string per line), csv */
  readonly inputFormat: InputFormat;

  /** CSV column name to extract PKs from (default: first column) */
  readonly csvColumn?: string;

  /** CSV delimiter character (default: ',') */
  readonly csvDelimiter?: string;

  /** Output file path (optional, console output is always provided) */
  readonly outputFile?: string;

  /** Comma-separated list of attributes to fetch (if omitted, fetches the whole item) */
  readonly outputAttributes?: string;

  /** Output format: dynamo-json, json, ndjson, csv, text */
  readonly outputFormat: OutputFormat;

  /** DynamoDB table name */
  readonly tableName: string;

  /** Optional name of the Index (GSI/LSI) to query */
  readonly indexName?: string;

  /** Name of the partition key attribute in the DynamoDB table */
  readonly tableKey: string;

  /** Optional name of the sort key attribute */
  readonly tableSortKey?: string;

  /** Optional value for the sort key */
  readonly tableSortValue?: string;

  /** Optional prefix to prepend to each PK value */
  readonly keyPrefix?: string;

  /** Optional suffix to append to each PK value */
  readonly keySuffix?: string;

  /** Preview mode: reads input and shows PKs without querying DynamoDB */
  readonly dryRun: boolean;

  /** Failure handling policy for per-key query errors */
  readonly failureMode: FailureMode;
}
