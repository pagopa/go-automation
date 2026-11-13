import type { GOScript } from '@go-automation/go-script';
import { GOJSONFileExporter } from '@pagopa/go-common/exporters';
import { GOPathType } from '@pagopa/go-common/files';
import type { CoverageReport } from '@go-automation/go-watchtower-runbook';

import type { CoverageExitCode } from '../libs/runCoverageCheck.js';

export interface CoverageArtifactV1 {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly exitCode: CoverageExitCode;
  readonly report: CoverageReport;
}

/**
 * Writes the mandatory coverage JSON into the current GOScript output directory.
 *
 * @param script - GOScript used only for output path resolution
 * @param report - Data-only coverage report
 * @param exitCode - Process result associated with the report
 * @returns The written artifact path
 */
export async function writeCoverageReport(
  script: GOScript,
  report: CoverageReport,
  exitCode: CoverageExitCode,
): Promise<string> {
  const outputPath = script.paths.resolvePath('coverage.json', GOPathType.OUTPUT);
  const artifact: CoverageArtifactV1 = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    exitCode,
    report,
  };

  await new GOJSONFileExporter({ outputPath, pretty: true, indent: 2 }).export(artifact);
  return outputPath;
}
