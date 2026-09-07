import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import { describe, it } from 'node:test';

import { Core } from '@go-automation/go-common';
import type { CoverageReport } from '@go-automation/go-watchtower-runbook';

import { COVERAGE_EXIT_CODES } from '../../libs/runCoverageCheck.js';
import { writeCoverageReport } from '../writeCoverageReport.js';
import type { CoverageArtifactV1 } from '../writeCoverageReport.js';

describe('writeCoverageReport', () => {
  it('writes the versioned JSON artifact through the go-common exporter', async () => {
    const temporaryDirectory = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'go-rta-coverage-'));
    const outputPath = nodePath.join(temporaryDirectory, 'coverage.json');
    const script = {
      paths: { resolvePath: () => outputPath },
    } as unknown as Core.GOScript;

    try {
      const writtenPath = await writeCoverageReport(script, REPORT, COVERAGE_EXIT_CODES.INVALID_COVERAGE);
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is confined to the private mkdtemp directory above.
      const artifact = JSON.parse(await fs.readFile(outputPath, 'utf8')) as CoverageArtifactV1;

      assert.strictEqual(writtenPath, outputPath);
      assert.strictEqual(artifact.schemaVersion, 1);
      assert.match(artifact.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.strictEqual(artifact.exitCode, COVERAGE_EXIT_CODES.INVALID_COVERAGE);
      assert.deepStrictEqual(artifact.report, REPORT);
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});

const REPORT: CoverageReport = {
  checkedRunbooks: 1,
  checkedKnownCases: 2,
  checkedReferences: 3,
  errors: [{ severity: 'ERROR', code: 'RESOURCE_NOT_FOUND', message: 'missing resource' }],
  warnings: [],
};
