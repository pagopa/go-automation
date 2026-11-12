/**
 * go-ai-client
 * Local CLI that invokes GO-AI.
 *
 * Two modes:
 *   DIRECT  — calls Bedrock directly via @go-automation/go-ai (dev/local)
 *   LAMBDA  — invokes the deployed GO-AI Lambda via AWS Lambda invoke API
 *
 * Usage:
 *   pnpm dev                                       → list available hats
 *   pnpm dev --hat gherkin --input ./my-srs.txt    → invoke with file
 *   pnpm dev --hat alarm-diagnosis --input "pn-DLQ..."  → invoke with raw string
 *
 * Set GO_AI_MODE=lambda to route through the deployed Lambda.
 */

import { GOScript } from '@go-automation/go-script';

import { scriptMetadata, scriptParameters } from './config.js';
import { main } from './main.js';

const script = new GOScript({
  metadata: scriptMetadata,
  config: {
    parameters: scriptParameters,
  },
});

script
  .run(async () => {
    await main(script);
  })
  .catch(() => {
    process.exit(1);
  });
