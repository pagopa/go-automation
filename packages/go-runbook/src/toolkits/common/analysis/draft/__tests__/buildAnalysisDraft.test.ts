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
  it('proposes COMPLETED when at least one detection is a closable case, and lists every case in order', () => {
    const cases = [
      analysedCase('first', { proposedStatus: 'IN_PROGRESS', resolution: 'Da lavorare.' }),
      analysedCase('second', { proposedStatus: 'COMPLETED', resolution: 'Chiudibile.' }),
    ];

    const draft = buildAnalysisDraft(
      runbook({ defaults: {}, cases }),
      createTestExecutionResult({ matchedCases: cases }),
    );

    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.schemaVersion, 1);
    assert.strictEqual(draft.proposedStatus, 'COMPLETED');
    assert.strictEqual(draft.analysisType, 'ANALYZABLE');
    assert.strictEqual(draft.conclusionNotes, '1. first: Da lavorare.\n2. second: Chiudibile.');
  });

  it('proposes IN_PROGRESS when no detection is a closable case', () => {
    const cases = [analysedCase('a', {}), analysedCase('b', {})];
    const draft = buildAnalysisDraft(
      runbook({ defaults: {}, cases }),
      createTestExecutionResult({ matchedCases: cases }),
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
  });

  it('is IGNORABLE only when every detection is ignorable with the same reason', () => {
    const ignorable = (id: string, code: string): KnownCase =>
      analysedCase(id, { analysisType: 'IGNORABLE', ignoreReasonCode: code, proposedStatus: 'COMPLETED' });
    const same = [ignorable('a', 'TEST'), ignorable('b', 'TEST')];
    const different = [ignorable('a', 'TEST'), ignorable('b', 'MAINTENANCE')];
    const mixed = [ignorable('a', 'TEST'), analysedCase('b', {})];

    const draftOf = (cases: ReadonlyArray<KnownCase>): ReturnType<typeof buildAnalysisDraft> =>
      buildAnalysisDraft(runbook({ defaults: {}, cases }), createTestExecutionResult({ matchedCases: cases }));
    const sameDraft = draftOf(same);
    assert.strictEqual(sameDraft?.kind === 'KNOWN_CASE' ? sameDraft.analysisType : undefined, 'IGNORABLE');
    assert.strictEqual(sameDraft?.kind === 'KNOWN_CASE' ? sameDraft.ignoreReasonCode : undefined, 'TEST');
    for (const cases of [different, mixed]) {
      const draft = draftOf(cases);
      assert.strictEqual(draft?.kind === 'KNOWN_CASE' ? draft.analysisType : undefined, 'ANALYZABLE');
      assert.strictEqual(draft?.kind === 'KNOWN_CASE' ? draft.ignoreReasonCode : 'x', undefined);
    }
  });

  it('writes the time of each detection and the coverage lines in the notes', () => {
    const cases = [analysedCase('only', { resolution: 'Risolto.' })];
    const result = createTestExecutionResult({
      matchedCases: cases,
      coverage: [{ stepId: 'query', complete: false, reason: 'saturated', detail: 'AccessDenied for profile x' }],
    });
    const draft = buildAnalysisDraft(runbook({ defaults: {}, cases }), {
      ...result,
      detections: [
        {
          knownCase: cases[0] ?? analysedCase('x', {}),
          firstSeenAt: '2026-11-19T10:15:42.000Z',
          evidenceRows: 1,
          observations: [],
        },
      ],
    });

    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(
      draft.conclusionNotes,
      '1. 2026-11-19 10:15:42 UTC — only: Risolto.\nEvidenza incompleta: 1 fonti (sature 1)',
    );
    assert.ok(!draft.conclusionNotes.includes('AccessDenied'));
  });

  it('keeps the draft of a single case unchanged when there is nothing to say about coverage', () => {
    const cases = [analysedCase('only', { resolution: 'Risolto.', errorDetails: 'Dettaglio.' })];
    const draft = buildAnalysisDraft(
      runbook({ defaults: {}, cases }),
      createTestExecutionResult({ matchedCases: cases }),
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.conclusionNotes, 'Risolto.');
    assert.strictEqual(draft.errorDetails, 'Dettaglio.');
  });

  it('fits many long entries within the text limit, keeping whole entries and saying how many were left out', () => {
    const cases = Array.from({ length: 4 }, (_unused, index) =>
      analysedCase(`case-${String(index)}`, { resolution: 'x'.repeat(2_000), errorDetails: 'é'.repeat(3_000) }),
    );
    const draft = buildAnalysisDraft(
      runbook({ defaults: {}, cases }),
      createTestExecutionResult({ matchedCases: cases }),
    );

    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.ok(draft.conclusionNotes.length <= 5_000);
    assert.ok((draft.errorDetails?.length ?? 0) <= 5_000);
    assert.match(draft.conclusionNotes, /^1\. case-0: x+\n2\. case-1: x+\n… e altri 2 casi \(vedi l'esecuzione\)$/u);
    assert.ok(Buffer.byteLength(JSON.stringify(draft), 'utf8') <= 65_536);
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
      },
      {
        ...analysedCase('secondary', {
          resolution: 'Secondary resolution',
          downstreams: [SEND_DOWNSTREAMS.ADE],
        }),
      },
    ];
    const definition = runbook({
      defaults: { downstreams: [SEND_DOWNSTREAMS.NESSUNO] },
      cases,
    });

    const candidates = buildPotentialAnalysisDrafts(definition);
    const runtimeDrafts = cases.map((knownCase) =>
      buildAnalysisDraft(definition, createTestExecutionResult({ matchedCases: [knownCase] })),
    );
    // All cases together are the worst case of the lists; the notes then list both declared resolutions.
    const together = buildAnalysisDraft(definition, createTestExecutionResult({ matchedCases: cases }));
    runtimeDrafts.push(together === undefined ? undefined : { ...together });
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
