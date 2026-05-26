import type { ScheduledEvent } from 'aws-lambda';

import { handler } from './handler.js';

const testEvent: ScheduledEvent = {
  version: '0',
  id: 'test-local-001',
  'detail-type': 'Scheduled Event',
  source: 'aws.events',
  account: '000000000000',
  time: new Date().toISOString(),
  region: process.env['AWS_REGION'] ?? 'eu-south-1',
  resources: ['arn:aws:events:eu-south-1:000000000000:rule/test-local'],
  detail: {},
};

async function run(): Promise<void> {
  console.log('--- Lambda local test ---');
  console.log(`Event: ${JSON.stringify(testEvent, null, 2)}\n`);

  try {
    const result = await handler(testEvent);
    console.log('\n--- Handler returned ---');
    console.log(result);
  } catch (error) {
    console.error('\n--- Handler threw ---');
    console.error(error);
    process.exitCode = 1;
  }
}

void run();
