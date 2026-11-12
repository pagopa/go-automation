/**
 * Utility for persisting the compact runbook execution result to disk.
 */

import type { GOScript } from '@go-automation/go-script';
import { GOJSONFileExporter } from '@pagopa/go-common/exporters';
import { GOPathType } from '@pagopa/go-common/files';
import { buildRunbookOutput } from '@pagopa/go-runbook';
import { buildCatalogOutputContext } from '@pagopa/go-runbook/catalog';
import type { Runbook, RunbookExecutionResult } from '@pagopa/go-runbook';

import { formatOutputSuffix } from './formatOutputSuffix.js';

export async function saveExecutionOutput(
  script: GOScript,
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
  const resultInfoPath = script.paths.resolvePathWithInfo(fileName, GOPathType.OUTPUT);
  const resultPath = resultInfoPath.path;

  const exporter = new GOJSONFileExporter({ outputPath: resultPath, pretty: true, indent: 2 });
  await exporter.export(output);

  script.logger.info(`Execution result saved: ${resultPath}`);
  return resultPath;
}
