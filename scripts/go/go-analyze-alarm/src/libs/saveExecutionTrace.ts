/**
 * Utility for persisting runbook execution traces to disk.
 */

import type { GOScript } from '@go-automation/go-script';
import { GOJSONFileExporter } from '@pagopa/go-common/exporters';
import { GOPathType } from '@pagopa/go-common/files';
import type { RunbookExecutionResult } from '@pagopa/go-runbook';
import { scrubAwsProfileNamesDeep } from '@pagopa/go-runbook/runtime';
import type { ErrorChainGroup } from '@pagopa/go-runbook/output';

import { formatOutputSuffix } from './formatOutputSuffix.js';

/**
 * Saves the RunbookExecutionTrace as a JSON file in the script's data directory, without the local AWS profile
 * names (input, execution environment, query diagnostics, error texts).
 * File name: trace-{alarmName}.json
 *
 * @param script - The GOScript instance for path resolution
 * @param result - The runbook execution result containing the trace
 * @param chains - The error chains of the execution, with all their members
 * @param alarmName - Alarm name used in the file name
 * @param profileNames - Local AWS profile names to remove from the file
 * @param outputSuffix - Optional suffix of the file name
 */
export async function saveExecutionTrace(
  script: GOScript,
  result: RunbookExecutionResult,
  chains: ReadonlyArray<ErrorChainGroup>,
  alarmName: string,
  profileNames: ReadonlyArray<string>,
  outputSuffix?: string,
): Promise<string> {
  const fileName = `trace-${alarmName}${formatOutputSuffix(outputSuffix)}.json`;
  const traceInfoPath = script.paths.resolvePathWithInfo(fileName, GOPathType.OUTPUT);
  const tracePath = traceInfoPath.path;

  // The trace of the engine and the error tree: its nodes (a merged node with its occurrences and the rows of its
  // errorKey) and every chain with all its members, which the result leaves out.
  const errorTree = result.tree === undefined ? {} : { errorTree: { nodes: result.tree, chains } };
  const exporter = new GOJSONFileExporter({ outputPath: tracePath, pretty: true, indent: 2 });
  await exporter.export(scrubAwsProfileNamesDeep({ ...result.trace, ...errorTree }, profileNames));

  return tracePath;
}
