/**
 * Utility for persisting runbook execution traces to disk.
 */

import type { GOScript } from '@go-automation/go-script';
import { GOJSONFileExporter } from '@pagopa/go-common/exporters';
import { GOPathType } from '@pagopa/go-common/files';
import type { RunbookExecutionResult } from '@pagopa/go-runbook';
import { scrubAwsProfileNamesDeep } from '@pagopa/go-runbook/runtime';

import { formatOutputSuffix } from './formatOutputSuffix.js';

/**
 * Saves the RunbookExecutionTrace as a JSON file in the script's data directory, without the local AWS profile
 * names (input, execution environment, query diagnostics, error texts).
 * File name: trace-{alarmName}.json
 *
 * @param script - The GOScript instance for path resolution
 * @param result - The runbook execution result containing the trace
 * @param alarmName - Alarm name used in the file name
 * @param profileNames - Local AWS profile names to remove from the file
 * @param outputSuffix - Optional suffix of the file name
 */
export async function saveExecutionTrace(
  script: GOScript,
  result: RunbookExecutionResult,
  alarmName: string,
  profileNames: ReadonlyArray<string>,
  outputSuffix?: string,
): Promise<string> {
  const fileName = `trace-${alarmName}${formatOutputSuffix(outputSuffix)}.json`;
  const traceInfoPath = script.paths.resolvePathWithInfo(fileName, GOPathType.OUTPUT);
  const tracePath = traceInfoPath.path;

  const exporter = new GOJSONFileExporter({ outputPath: tracePath, pretty: true, indent: 2 });
  await exporter.export(scrubAwsProfileNamesDeep(result.trace, profileNames));

  script.logger.info(`Execution trace saved: ${tracePath}`);
  return tracePath;
}
