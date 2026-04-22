/**
 * Local test harness for the Lambda handler.
 *
 * Invokes the handler with a mock ScheduledEvent, simulating what
 * EventBridge would send. Requires the same env vars the Lambda expects.
 *
 * Usage:
 *   # Set required env vars (or use a .env file with --env-file)
 *   export AWS_PROFILE=sso_pn-core-prod
 *   export AWS_REGION=eu-south-1
 *
 *   # Run with tsx (no build needed)
 *   pnpm --filter=go-send-monitor-tpp-messages-lambda test:local
 *
 *   # Or with custom overrides via event payload
 *   # (edit the testEvent below)
 */

import type { Context, ScheduledEvent } from 'aws-lambda';

import { handler } from './handler.js';

/**
 * Mock ScheduledEvent — same shape EventBridge sends on a cron trigger.
 *
 * Config overrides can be added as top-level keys:
 * - camelCase keys are auto-mapped to dot.notation by GOLambdaEventConfigProvider
 *   e.g. "athenaDatabase" → "athena.database"
 * - env vars take precedence over event payload (GOEnvironmentConfigProvider > GOLambdaEventConfigProvider)
 */
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

/**
 * Minimal Lambda Context mock. Only the fields actually touched by the handler
 * (callbackWaitsForEmptyEventLoop, getRemainingTimeInMillis) are meaningful; the
 * rest satisfy the type but hold placeholder values.
 */
const createMockContext = (): Context => ({
  callbackWaitsForEmptyEventLoop: true,
  functionName: 'local-test',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:eu-south-1:000000000000:function:local-test',
  memoryLimitInMB: '512',
  awsRequestId: 'local-test-request',
  logGroupName: '/aws/lambda/local-test',
  logStreamName: 'local-test-stream',
  getRemainingTimeInMillis: () => 5 * 60 * 1000,
  done: () => undefined,
  fail: () => undefined,
  succeed: () => undefined,
});

async function run(): Promise<void> {
  console.log('--- Lambda local test ---');
  console.log(`Event: ${JSON.stringify(testEvent, null, 2)}\n`);

  try {
    const result = await handler(testEvent, createMockContext());
    console.log('\n--- Handler returned ---');
    console.log(result);
  } catch (error) {
    console.error('\n--- Handler threw ---');
    console.error(error);
    process.exitCode = 1;
  }
}

void run();
