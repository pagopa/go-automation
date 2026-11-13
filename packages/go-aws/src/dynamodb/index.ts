/**
 * @pagopa/go-aws/dynamodb — requires the peers `@aws-sdk/client-dynamodb` and `@aws-sdk/util-dynamodb`.
 */

export { DYNAMODB_CLIENT } from './DYNAMODB_CLIENT.js';
export { AWSDynamoDBService } from './AWSDynamoDBService.js';
export { DynamoDBQueryService } from './DynamoDBQueryService.js';
export type { DynamoDBQueryProgressHandler } from './DynamoDBQueryService.js';
export type { DynamoDBQueryOptions, DynamoDBKeyType } from './models/DynamoDBQueryOptions.js';
export type { DynamoDBQueryResult } from './models/DynamoDBQueryResult.js';
export type {
  TableDescription,
  TableStatus,
  AttributeValue,
  QueryCommandInput,
  QueryCommandOutput,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
