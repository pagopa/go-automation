/**
 * @pagopa/go-aws/sqs — requires the peers `@aws-sdk/client-sqs` and `@aws-sdk/client-cloudwatch`
 * (DLQ metrics).
 */

export { SQS_CLIENT } from './SQS_CLIENT.js';
export { AWSSQSService } from './AWSSQSService.js';
export { SQSUtils, SQS_MAX_BATCH_SIZE, SQS_MAX_PAYLOAD_BYTES } from './SQSUtils.js';
export type { DLQStats } from './models/DLQStats.js';
export { SQSProcessAction } from './models/SQSProcessAction.js';
export { SQSReceiveDeduplicationMode } from './models/SQSReceiveDeduplicationMode.js';
export type { SQSQueueMetadata } from './models/SQSQueueMetadata.js';
export type { SQSBatchSendRetryOptions } from './models/SQSBatchSendRetryOptions.js';
export type { SQSReceiveOptions } from './models/SQSReceiveOptions.js';
export type { SQSReceiveResult } from './models/SQSReceiveResult.js';
export type { SQSReceiveCallbacks } from './models/SQSReceiveCallbacks.js';
export type { SQSProcessOptions } from './models/SQSProcessOptions.js';
export type { SQSProcessResult } from './models/SQSProcessResult.js';
export type { SQSProcessCallbacks } from './models/SQSProcessCallbacks.js';
export type { SQSMoveOptions } from './models/SQSMoveOptions.js';
export type { SQSMoveResult } from './models/SQSMoveResult.js';
export type { SQSMoveError } from './models/SQSMoveError.js';
export type { SQSMoveErrorStage } from './models/SQSMoveErrorStage.js';
export type { SQSMoveCallbacks } from './models/SQSMoveCallbacks.js';
export type {
  SQSBatchRetryHandler,
  SQSReceiveProgressHandler,
  SQSReceiveEmptyReceiveHandler,
  SQSProcessProgressHandler,
  SQSMessageHandler,
  SQSMoveProgressHandler,
  SQSMoveErrorHandler,
} from './models/SQSHandlers.js';
export type {
  Message,
  SendMessageBatchRequestEntry,
  SendMessageBatchCommandOutput,
  SQSClient,
} from '@aws-sdk/client-sqs';
