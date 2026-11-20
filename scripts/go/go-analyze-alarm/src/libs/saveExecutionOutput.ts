/**
 * Utility for persisting the compact runbook execution result to disk.
 */

import type { GOScript } from '@go-automation/go-script';
import { GOJSONFileExporter } from '@pagopa/go-common/exporters';
import { GOPathType } from '@pagopa/go-common/files';
import { buildRunbookOutput } from '@pagopa/go-runbook/toolkits/common';
import { buildCatalogOutputContext, scrubAwsProfileNamesDeep } from '@pagopa/go-runbook/runtime';
import type { Runbook, RunbookExecutionResult } from '@pagopa/go-runbook';

import { formatOutputSuffix } from './formatOutputSuffix.js';

/**
 * Saves the structured runbook output as a JSON file, without the local AWS profile names.
 * File name: result-{runbookId}.json
 *
 * @param script - The GOScript instance for path resolution
 * @param runbook - The executed runbook
 * @param result - The runbook execution result
 * @param profileNames - Local AWS profile names to remove from the file
 * @param traceFile - Path of the saved trace, referenced by the output
 * @param outputSuffix - Optional suffix of the file name
 * @returns The path of the written file
 */
export async function saveExecutionOutput(
  script: GOScript,
  runbook: Runbook,
  result: RunbookExecutionResult,
  profileNames: ReadonlyArray<string>,
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
  await exporter.export(scrubAwsProfileNamesDeep(output, profileNames));

  script.logger.info(`Execution result saved: ${resultPath}`);
  return resultPath;
}
