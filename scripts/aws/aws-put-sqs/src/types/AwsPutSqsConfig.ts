export interface AwsPutSqsConfig {
  readonly queueUrl?: string;
  readonly queueName?: string;
  readonly inputFile: string;
  readonly fileFormat: 'text' | 'json' | 'csv' | 'auto';
  readonly csvColumn: string;
  readonly batchSize: number;
  readonly delaySeconds: number;
  readonly batchMaxRetries: number;
  readonly fifoGroupId?: string;
  readonly fifoDeduplicationStrategy: 'content' | 'hash';
}
