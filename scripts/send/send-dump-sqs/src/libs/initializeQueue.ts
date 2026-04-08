/**
 * Resolves the SQS queue URL and fetches queue attributes.
 */

import { GetQueueAttributesCommand, GetQueueUrlCommand, type QueueAttributeName } from '@aws-sdk/client-sqs';
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
 * @param queueName - SQS queue name
 * @param prompt - GOPrompt for spinner feedback
 * @param logger - GOLogger for capacity warnings
 * @returns Queue URL, approximate message count, and FIFO flag
 */
export async function initializeQueue(
  sqsClient: Core.GOScript['aws']['sqs'],
  queueName: string,
  prompt: Core.GOPrompt,
  logger: Core.GOLogger,
): Promise<QueueInitResult> {
  prompt.spin('init', `Initializing dump for queue "${queueName}"...`);

  try {
    const getUrlResponse = await sqsClient.send(new GetQueueUrlCommand({ QueueName: queueName }));
    if (getUrlResponse.QueueUrl === undefined) {
      throw new Error(`Queue URL not found for "${queueName}"`);
    }
    const queueUrl = getUrlResponse.QueueUrl;

    const isFifoByName = queueName.endsWith('.fifo');
    const attributeNames: QueueAttributeName[] = ['ApproximateNumberOfMessages'];
    if (isFifoByName) {
      attributeNames.push('FifoQueue');
    }

    const getAttrResponse = await sqsClient.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: attributeNames,
      }),
    );

    const isFifo = isFifoByName || getAttrResponse.Attributes?.FifoQueue === 'true';
    const approxMessages = parseInt(getAttrResponse.Attributes?.ApproximateNumberOfMessages ?? '0', 10);
    const inFlightLimit = isFifo ? 20000 : 120000;

    prompt.spinSucceed('init', `Queue initialized. Approx. messages: ${approxMessages}${isFifo ? ' (FIFO)' : ''}`);

    if (approxMessages > inFlightLimit) {
      logger.warning(
        `Queue size (${approxMessages}) exceeds SQS in-flight message limit (${inFlightLimit}). ` +
          'Dumping without deleting will stop once the limit is reached.',
      );
    }

    return { queueUrl, approxMessages, isFifo };
  } catch (error) {
    prompt.spinFail('init', `Failed to initialize queue: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
