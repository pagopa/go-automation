import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { KnownCase } from '../../../../../engine/types/KnownCase.js';
import type { KnownCaseAnalysis } from '../../KnownCaseAnalysis.js';
import type { Runbook } from '../../../../../engine/types/Runbook.js';
import type { RunbookAnalysisDefaults } from '../../RunbookAnalysisDefaults.js';
import type { RunbookExecutionStatus } from '../../../../../engine/types/RunbookExecutionStatus.js';
import { SEND_DOWNSTREAMS } from '../../../../send/analysis/SEND_DOWNSTREAMS.js';
import { buildAnalysisDraft, buildPotentialAnalysisDrafts } from '../buildAnalysisDraft.js';
import { createTestExecutionResult } from '../../../../../__tests__/helpers/createTestExecutionResult.js';
import { createTestRunbook } from '../../../../../__tests__/helpers/createTestRunbook.js';

describe('buildAnalysisDraft', () => {
  it('emits a KNOWN_CASE draft taking scalars from the primary case even when other cases matched', () => {
    const cases = [
      analysedCase('primary', { proposedStatus: 'IN_PROGRESS' }),
      analysedCase('secondary', { proposedStatus: 'COMPLETED' }),
    ];

    const draft = buildAnalysisDraft(
      runbook({ defaults: {}, cases }),
      createTestExecutionResult({ matchedCases: cases }),
    );

    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.schemaVersion, 1);
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(draft.analysisType, 'ANALYZABLE');
  });

  it('unions the lists of defaults and every matched case, de-duplicated', () => {
    const cases = [
      analysedCase('primary', { downstreams: [SEND_DOWNSTREAMS.APP_IO], finalActions: ['Nessuna azione'] }),
      analysedCase('secondary', { downstreams: [SEND_DOWNSTREAMS.APP_IO, SEND_DOWNSTREAMS.ADE] }),
    ];
    const defaults: RunbookAnalysisDefaults = {
      downstreams: [SEND_DOWNSTREAMS.NESSUNO],
      finalActions: ['Nessuna azione'],
    };

    const draft = buildAnalysisDraft(runbook({ defaults, cases }), createTestExecutionResult({ matchedCases: cases }));

    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.deepStrictEqual(draft.downstreams, ['Nessuno', 'AppIO', 'AdE']);
    assert.deepStrictEqual(draft.finalActions, ['Nessuna azione']);
  });

  it('de-duplicates resources by name and links by url, keeping the first declaration', () => {
    const defaults: RunbookAnalysisDefaults = {
      resources: [{ name: 'pn-delivery', type: 'Service', role: 'PRIMARY' }],
      links: [{ url: 'https://example.test/a', name: 'from-defaults' }],
    };
    const cases = [
      analysedCase('primary', {
        resources: [{ name: 'pn-delivery', type: 'Service', role: 'CASE_RELATED' }],
        links: [{ url: 'https://example.test/a', name: 'from-case' }],
      }),
    ];

    const draft = buildAnalysisDraft(runbook({ defaults, cases }), createTestExecutionResult({ matchedCases: cases }));

    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.deepStrictEqual(draft.resources, [{ name: 'pn-delivery', type: 'Service', role: 'PRIMARY' }]);
    assert.deepStrictEqual(draft.links, [{ url: 'https://example.test/a', name: 'from-defaults' }]);
  });

  it('interpolates the resolution and renders missing placeholders explicitly', () => {
    const cases = [analysedCase('primary', { resolution: 'File {{vars.fileKey}} in {{vars.missing}}' })];

    const draft = buildAnalysisDraft(
      runbook({ defaults: {}, cases }),
      createTestExecutionResult({ matchedCases: cases, vars: { fileKey: 'abc-123' } }),
    );

    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.conclusionNotes, 'File abc-123 in non disponibile');
  });

  it('builds static budget candidates with the same envelope and merge rules as runtime drafts', () => {
    const cases: ReadonlyArray<KnownCase> = [
      {
        ...analysedCase('primary', {
          resolution: 'Primary resolution',
          downstreams: [SEND_DOWNSTREAMS.APP_IO],
        }),
        priority: 200,
      },
      {
        ...analysedCase('secondary', {
          resolution: 'Secondary resolution',
          downstreams: [SEND_DOWNSTREAMS.ADE],
        }),
        priority: 100,
      },
    ];
    const definition = runbook({
      defaults: { downstreams: [SEND_DOWNSTREAMS.NESSUNO] },
      cases,
    });

    const candidates = buildPotentialAnalysisDrafts(definition);
    const runtimeDrafts = cases.map((_primary, index) =>
      buildAnalysisDraft(definition, createTestExecutionResult({ matchedCases: cases.slice(index) })),
    );
    runtimeDrafts.push(buildAnalysisDraft(definition, createTestExecutionResult({ matchedCases: [] })));

    assert.deepStrictEqual(candidates, runtimeDrafts);
  });

  it('emits the UNKNOWN_CASE_CONTEXT draft when no case matched', () => {
    const defaults: RunbookAnalysisDefaults = {
      runbookName: 'Runbook documentale',
      downstreams: [SEND_DOWNSTREAMS.NESSUNO],
    };

    const draft = buildAnalysisDraft(runbook({ defaults, cases: [] }), createTestExecutionResult({ matchedCases: [] }));

    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    assert.strictEqual(draft.runbookName, 'Runbook documentale');
    assert.deepStrictEqual(draft.downstreams, ['Nessuno']);
  });

  it('emits no draft for a failed or aborted run', () => {
    const cases = [analysedCase('primary', {})];

    for (const status of ['failed', 'aborted'] satisfies ReadonlyArray<RunbookExecutionStatus>) {
      const draft = buildAnalysisDraft(
        runbook({ defaults: {}, cases }),
        createTestExecutionResult({ matchedCases: cases, status }),
      );
      assert.strictEqual(draft, undefined, `status ${status} must not produce a draft`);
    }
  });

  it('emits no draft when the matched case carries no annotation', () => {
    const { analysis: _ignored, ...bare } = analysedCase('primary', {});

    const draft = buildAnalysisDraft(
      runbook({ defaults: undefined, cases: [bare] }),
      createTestExecutionResult({ matchedCases: [bare] }),
    );

    assert.strictEqual(draft, undefined);
  });
});

interface RunbookFixture {
  readonly defaults: RunbookAnalysisDefaults | undefined;
  readonly cases: ReadonlyArray<KnownCase>;
}

function runbook(fixture: RunbookFixture): Runbook {
  return createTestRunbook({
    knownCases: fixture.cases,
    ...(fixture.defaults === undefined ? {} : { analysisDefaults: fixture.defaults }),
  });
}

function analysedCase(id: string, analysis: Partial<KnownCaseAnalysis>): KnownCase {
  return {
    id,
    description: id,
    priority: 100,
    condition: { type: 'contains', ref: 'steps.query', regex: 'boom' },
    action: { type: 'log', level: 'info', title: `[CASO NOTO] ${id}` },
    analysis: {
      resolution: 'Chiusura - caso noto.',
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      ...analysis,
    },
  };
}
