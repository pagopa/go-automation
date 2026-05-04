/**
 * AWS Delete SQS - Load Target IDs Library
 */

import { Core, AWS } from '@go-automation/go-common';
import type { AwsDeleteSqsConfig } from '../types/index.js';

/**
 * Load target message IDs from input file
 * @param config - Configuration for the script
 * @param script - Script instance
 * @returns Promise<Set<string> | undefined> - Set of message IDs to delete or undefined if no input file
 */

export async function loadTargetIds(
  config: AwsDeleteSqsConfig,
  script: Core.GOScript,
): Promise<Set<string> | undefined> {
  if (!config.inputFile) return undefined;

  script.logger.info(`Loading target messages from: ${config.inputFile}`);

  const inputPath = script.paths.resolvePath(config.inputFile, Core.GOPathType.INPUT);
  const importer = new Core.GOJSONListImporter<AWS.Message>({ jsonl: true });
  const { items } = await importer.import(inputPath);

  const ids = new Set(items.map((m) => m.MessageId).filter((id): id is string => !!id));

  script.logger.info(`Loaded ${ids.size} unique MessageIds to delete.`);
  return ids;
}
