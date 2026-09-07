import type { Core } from '@go-automation/go-common';
import { valueToString } from '@go-automation/go-common/core';

import { renderCoverage } from '../report/renderCoverage.js';
import { writeCoverageReport } from '../report/writeCoverageReport.js';
import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import { resolveClient } from './resolveClient.js';
import type { Connection } from './resolveClient.js';
import { COVERAGE_EXIT_CODES, runCoverageCheck } from './runCoverageCheck.js';
import type { CoverageExitCode } from './runCoverageCheck.js';

type ResolveConnectionFn = (script: Core.GOScript, config: GoRtaCheckConfig) => Promise<Connection | undefined>;

interface CoverageModeDependencies {
  readonly resolveConnection: ResolveConnectionFn;
  readonly runCheck: typeof runCoverageCheck;
  readonly writeReport: typeof writeCoverageReport;
}

const DEFAULT_DEPENDENCIES: CoverageModeDependencies = {
  resolveConnection: resolveClient,
  runCheck: runCoverageCheck,
  writeReport: writeCoverageReport,
};

/**
 * Runs the whole coverage mode, including credential resolution and login.
 *
 * No operational failure escapes this boundary: missing configuration,
 * credentials, authentication, network and response parsing all map to exit 2.
 */
export async function runCoverageMode(
  script: Core.GOScript,
  config: GoRtaCheckConfig,
  dependencies: CoverageModeDependencies = DEFAULT_DEPENDENCIES,
): Promise<CoverageExitCode> {
  try {
    const connection = await dependencies.resolveConnection(script, config);
    if (connection === undefined) {
      script.logger.error('Coverage non eseguibile: connessione Watchtower non disponibile.');
      return COVERAGE_EXIT_CODES.NOT_EXECUTABLE;
    }
    const result = await dependencies.runCheck(script.logger, connection.client);
    if (result.kind === 'NOT_EXECUTABLE') return result.exitCode;

    renderCoverage(script.logger, result.report);
    const artifactPath = await dependencies.writeReport(script, result.report, result.exitCode);
    script.logger.section('Report');
    script.logger.info(`Salvato: ${artifactPath}`);
    return result.exitCode;
  } catch (error) {
    script.logger.error(`Coverage non eseguibile: ${valueToString(error)}`);
    return COVERAGE_EXIT_CODES.NOT_EXECUTABLE;
  }
}
