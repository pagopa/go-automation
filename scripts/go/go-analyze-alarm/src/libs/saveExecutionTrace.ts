/**
 * Utility for persisting runbook execution traces to disk.
 */

import { Core } from '@go-automation/go-common';
import * as Runbook from '@go-automation/go-runbook';

/**
 * Saves the RunbookExecutionTrace as a JSON file in the script's data directory.
 * File name: trace-{alarmName}.json
 *
 * @param script - The GOScript instance for path resolution
 * @param result - The runbook execution result containing the trace
 * @param alarmName - Alarm name used in the file name
 */
export async function saveExecutionTrace(
  script: Core.GOScript,
  result: Runbook.RunbookExecutionResult,
  alarmName: string,
): Promise<void> {
  const fileName = `trace-${alarmName}.json`;
  const traceInfoPath = script.paths.resolvePathWithInfo(fileName, Core.GOPathType.OUTPUT);
  const tracePath = traceInfoPath.path;

  const exporter = new Core.GOJSONFileExporter({ outputPath: tracePath });
  await exporter.export(result.trace);

  script.logger.info(`Execution trace saved: ${tracePath}`);
}
