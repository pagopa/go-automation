/**
 * AWS Dump SQS - Export If Not Empty Library
 */

import { AWS, Core } from '@go-automation/go-common';

/**
 * Resolves the queue URL, fetches attributes, and warns about capacity limits.
 *
 * @param messages - Messages to export
 * @param outputPath - Path to export messages
 * @returns Queue URL, approximate message count, and FIFO flag
 */

export async function exportIfNonEmpty(messages: ReadonlyArray<AWS.Message>, outputPath: string): Promise<void> {
  if (messages.length === 0) return;

  const exporter = new Core.GOJSONListExporter<AWS.Message>({
    outputPath,
    jsonl: true,
  });

  await exporter.export(messages);
}
