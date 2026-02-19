/**
 * Supported input file formats for partition key lists
 */
export type InputFormat = 'txt' | 'jsonl' | 'csv';

/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface SendFetchDynamodbDataConfig {
  /** AWS profile name for SSO authentication */
  readonly awsProfile: string;

  /** Input PK file path */
  readonly inputFile: string;

  /** Input file format: txt (one PK per line), jsonl (one JSON string per line), csv */
  readonly inputFormat: InputFormat;

  /** CSV column name to extract PKs from (default: first column) */
  readonly csvColumn?: string;

  /** CSV delimiter character (default: ',') */
  readonly csvDelimiter?: string;

  /** Output JSON file path */
  readonly outputFile: string;

  /** Output format: json or ndjson */
  readonly outputFormat: 'json' | 'ndjson';

  /** DynamoDB table name */
  readonly tableName: string;

  /** Name of the partition key attribute in the DynamoDB table */
  readonly tableKey: string;

  /** Optional prefix to prepend to each PK value */
  readonly keyPrefix?: string;

  /** Optional suffix to append to each PK value */
  readonly keySuffix?: string;

  /** Preview mode: reads input and shows PKs without querying DynamoDB */
  readonly dryRun: boolean;
}
