/**
 * Utility for persisting the compact runbook execution result to disk.
 */

import { Core } from '@go-automation/go-common';
import { apigw, lambda, service, buildRunbookOutput } from '@go-automation/go-runbook';
import type { Runbook, RunbookExecutionResult } from '@go-automation/go-runbook';

export async function saveExecutionOutput(
  script: Core.GOScript,
  runbook: Runbook,
  result: RunbookExecutionResult,
  traceFile?: string,
): Promise<string> {
  const output = buildRunbookOutput(runbook, result, {
    ...(traceFile !== undefined ? { traceFile } : {}),
    contextBuilder: (rb, executionResult) =>
      apigw.buildApiGwOutputContext(rb, executionResult) ??
      lambda.buildLambdaOutputContext(rb, executionResult) ??
      service.buildServiceOutputContext(rb, executionResult),
  });

  const fileName = `result-${runbook.metadata.id}.json`;
  const resultInfoPath = script.paths.resolvePathWithInfo(fileName, Core.GOPathType.OUTPUT);
  const resultPath = resultInfoPath.path;

  const exporter = new Core.GOJSONFileExporter({ outputPath: resultPath, pretty: true, indent: 2 });
  await exporter.export(output);

  script.logger.info(`Execution result saved: ${resultPath}`);
  return resultPath;
}
