/**
 * GO AI Client - Main Logic Module
 *
 * Resolves the invocation mode, loads the input, and calls GO-AI.
 */

import { Core } from '@go-automation/go-common';

import { GOAIHat, type GOAIRequest } from '@go-automation/go-ai';

import type { GoAIClientConfig } from './types/index.js';
import { loadInput, stabilize } from './libs/inputUtils.js';
import { printHats } from './libs/printHats.js';
import { invokeDirect, invokeLambda } from './libs/invokers.js';

/**
 * Main script execution function.
 *
 * @param script - The GOScript instance for logging and configuration
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<GoAIClientConfig>();

  if (!config.hat) {
    printHats(script);
    script.logger.text(`\nUsage: pnpm dev --hat <hat> --input '<text or path>'\n`);
    script.logger.text(`Mode:  ${config.goAiMode} (set GO_AI_MODE=lambda to route through deployed Lambda)\n`);
    return;
  }

  if (!Object.values(GOAIHat).includes(config.hat as GOAIHat)) {
    script.logger.error(`Unknown hat: '${config.hat}'`);
    printHats(script);
    process.exit(1);
  }

  if (!config.input) {
    script.logger.error('Missing input. Provide --input with a text string or a file path.');
    process.exit(1);
  }

  const req: GOAIRequest = {
    hat: config.hat as GOAIHat,
    input: await loadInput(config.input, script),
  };

  script.logger.info(`Hat:     ${req.hat}`);
  script.logger.info(`Mode:    ${config.goAiMode}`);
  script.logger.info(`Profile: ${config.awsProfile}`);
  script.logger.info(`Input:   ${req.input.length} chars`);

  const response = config.goAiMode === 'lambda' ? await invokeLambda(req, config) : await invokeDirect(req, config);

  script.logger.info(`${response.inputTokens} in / ${response.outputTokens} out tokens`);

  const parsed = stabilize(response.output);
  console.log(JSON.stringify(parsed, null, 2));
}
