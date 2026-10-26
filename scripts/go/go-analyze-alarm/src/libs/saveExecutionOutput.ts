/**
 * Utility for persisting the compact runbook execution result to disk.
 */

import { Core } from '@go-automation/go-common';
import { buildRunbookOutput } from '@go-automation/go-runbook';
import { buildCatalogOutputContext } from '@go-automation/go-runbook/catalog';
import type { Runbook, RunbookExecutionResult } from '@go-automation/go-runbook';

import { formatOutputSuffix } from './formatOutputSuffix.js';

export async function saveExecutionOutput(
  script: Core.GOScript,
  runbook: Runbook,
  result: RunbookExecutionResult,
  traceFile?: string,
  outputSuffix?: string,
): Promise<string> {
  const output = buildRunbookOutput(runbook, result, {
    ...(traceFile !== undefined ? { traceFile } : {}),
    contextBuilder: buildCatalogOutputContext,
  });

  const fileName = `result-${runbook.metadata.id}${formatOutputSuffix(outputSuffix)}.json`;
  const resultInfoPath = script.paths.resolvePathWithInfo(fileName, Core.GOPathType.OUTPUT);
  const resultPath = resultInfoPath.path;

  const exporter = new Core.GOJSONFileExporter({ outputPath: resultPath, pretty: true, indent: 2 });
  await exporter.export(output);

  script.logger.info(`Execution result saved: ${resultPath}`);
  return resultPath;
}
