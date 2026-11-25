import type { ScheduledEvent } from 'aws-lambda';

import { GOScript } from '@go-automation/go-script';
import { prepareConfig, scriptMetadata, scriptParameters } from 'send-monitor-athena-query/config';
import { main } from 'send-monitor-athena-query/main';

const script = new GOScript({
  metadata: scriptMetadata,
  config: {
    parameters: scriptParameters,
  },
  hooks: {
    onAfterConfigLoad: prepareConfig,
  },
});

export const handler = script.createLambdaHandler<ScheduledEvent>(async (_event) => {
  await main(script);
});
