/**
 * Resolves the SQS queue URL and fetches queue attributes.
 */

import { Core } from '@go-automation/go-common';

/**
 * Result of queue initialization.
 */
interface QueueInitResult {
  readonly queueUrl: string;
  readonly approxMessages: number;
  readonly isFifo: boolean;
}

/**
 * Resolves the queue URL, fetches attributes, and warns about capacity limits.
 *
 * @param sqsClient - AWS SQS client from GOScript
 * @param cloudWatchClient - AWS CloudWatch client from GOScript
 * @param queueName - SQS queue name
 * @param prompt - GOPrompt for spinner feedback
 * @param logger - GOLogger for capacity warnings
 * @returns Queue URL, approximate message count, and FIFO flag
 */
export async function initializeQueue(
  sqsClient: Core.GOScript['aws']['sqs'],
  cloudWatchClient: Core.GOScript['aws']['cloudWatch'],
  queueName: string,
  prompt: Core.GOPrompt,
  logger: Core.GOLogger,
): Promise<QueueInitResult> {
  prompt.spin('init', `Initializing dump for queue "${queueName}"...`);

  try {
    const sqsService = new Core.AWSSQSService(sqsClient, cloudWatchClient);
    const metadata = await sqsService.resolveQueueMetadata(queueName);

    const inFlightLimit = metadata.isFifo ? 20000 : 120000;

    prompt.spinSucceed(
      'init',
      `Queue initialized. Approx. messages: ${metadata.approxMessages}${metadata.isFifo ? ' (FIFO)' : ''}`,
    );

    if (metadata.approxMessages > inFlightLimit) {
      logger.warning(
        `Queue size (${metadata.approxMessages}) exceeds SQS in-flight message limit (${inFlightLimit}). ` +
          'Dumping without deleting will stop once the limit is reached.',
      );
    }

    return {
      queueUrl: metadata.queueUrl,
      approxMessages: metadata.approxMessages,
      isFifo: metadata.isFifo,
    };
  } catch (error) {
    prompt.spinFail('init', `Failed to initialize queue: ${Core.getErrorMessage(error)}`);
    throw error;
  }
}
