import type { SQSEvent } from 'aws-lambda';

import type { ExecuteRunbookDeps } from 'go-execute-runbook/api';

import { processExecuteRunbookBatch } from './handler.js';

const event: SQSEvent = {
  Records: [
    {
      messageId: 'local-invalid-message',
      receiptHandle: 'local',
      body: 'not-json',
      attributes: {
        ApproximateReceiveCount: '1',
        SentTimestamp: '0',
        SenderId: 'local',
        ApproximateFirstReceiveTimestamp: '0',
      },
      messageAttributes: {},
      md5OfBody: 'local',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:eu-south-1:000000000000:local.fifo',
      awsRegion: 'eu-south-1',
    },
  ],
};

const result = await processExecuteRunbookBatch(event, {} as ExecuteRunbookDeps, () => 60_000);
console.log(JSON.stringify(result));
