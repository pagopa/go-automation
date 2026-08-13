import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { ANALYSIS_DRAFT_BOUNDS, type AnalysisDraftV1 } from '@go-automation/go-runbook';

import { toCompleteAnalysisDraft } from '../toCompleteAnalysisDraft.js';
import { resolveApplyMode } from '../resolveApplyMode.js';

function knownDraft(overrides: Partial<Extract<AnalysisDraftV1, { kind: 'KNOWN_CASE' }>> = {}): AnalysisDraftV1 {
  return {
    schemaVersion: 1,
    kind: 'KNOWN_CASE',
    proposedStatus: 'COMPLETED',
    analysisType: 'ANALYZABLE',
    conclusionNotes: 'conclusione',
    resources: [],
    downstreams: [],
    finalActions: [],
    links: [],
    ...overrides,
  };
}

describe('toCompleteAnalysisDraft', () => {
  it('passes a compliant draft through unchanged', () => {
    const draft = knownDraft({
      resources: [{ name: 'pn-ss', type: 'LAMBDA' }],
      downstreams: ['SPID'],
      finalActions: ['Nessuna azione'],
      links: [{ url: 'https://example.test/runbook', name: 'Runbook' }],
    });
    assert.deepEqual(toCompleteAnalysisDraft(draft), draft);
  });

  it('returns undefined when the runbook produced no draft', () => {
    assert.equal(toCompleteAnalysisDraft(undefined), undefined);
  });

  it('truncates prose but never an identifier', () => {
    const longNotes = 'x'.repeat(ANALYSIS_DRAFT_BOUNDS.TEXT_LENGTH + 100);
    const longName = 'y'.repeat(ANALYSIS_DRAFT_BOUNDS.NAME_LENGTH + 1);
    const result = toCompleteAnalysisDraft(
      knownDraft({ conclusionNotes: longNotes, downstreams: [longName, 'SPID'] }),
    ) as Extract<AnalysisDraftV1, { kind: 'KNOWN_CASE' }>;

    assert.equal(result.conclusionNotes.length, ANALYSIS_DRAFT_BOUNDS.TEXT_LENGTH, 'la prosa si tronca');
    // Un nome accorciato non è un nome più corto: è un nome diverso, che
    // risolverebbe sull'entità sbagliata o fallirebbe con un valore fuorviante.
    assert.deepEqual(result.downstreams, ['SPID'], "l'identificatore fuori bound esce, non viene tagliato");
  });

  it('drops links whose url exceeds the bound and keeps the others', () => {
    const longUrl = `https://example.test/${'p'.repeat(ANALYSIS_DRAFT_BOUNDS.URL_LENGTH)}`;
    const result = toCompleteAnalysisDraft(
      knownDraft({ links: [{ url: longUrl }, { url: 'https://example.test/ok' }] }),
    ) as Extract<AnalysisDraftV1, { kind: 'KNOWN_CASE' }>;
    assert.deepEqual(result.links, [{ url: 'https://example.test/ok' }]);
  });

  it('clamps reference arrays to the contract maximum', () => {
    const many = Array.from({ length: ANALYSIS_DRAFT_BOUNDS.ARRAY_ITEMS + 10 }, (_, i) => `downstream-${i}`);
    const result = toCompleteAnalysisDraft(knownDraft({ downstreams: many })) as Extract<
      AnalysisDraftV1,
      { kind: 'KNOWN_CASE' }
    >;
    assert.equal(result.downstreams.length, ANALYSIS_DRAFT_BOUNDS.ARRAY_ITEMS);
  });

  it('keeps the unknown-context branch on its own shape', () => {
    const context: AnalysisDraftV1 = {
      schemaVersion: 1,
      kind: 'UNKNOWN_CASE_CONTEXT',
      resources: [],
      downstreams: [],
      finalActions: [],
      links: [],
    };
    const result = toCompleteAnalysisDraft(context) as Record<string, unknown>;
    assert.equal(result['kind'], 'UNKNOWN_CASE_CONTEXT');
    assert.equal(result['proposedStatus'], undefined, 'un contesto unknown non propone stati');
  });
});

describe('resolveApplyMode', () => {
  it('maps the launchable modes', () => {
    assert.equal(resolveApplyMode(undefined), 'SHADOW');
    assert.equal(resolveApplyMode('none'), 'SHADOW');
    assert.equal(resolveApplyMode('known'), 'APPLY_KNOWN');
  });

  it('rejects `all` with an explicit reason instead of a 400 downstream', () => {
    assert.throws(() => resolveApplyMode('all'), /APPLY_ALL is disabled in v1/u);
  });
});

describe('cross-repo draft fixtures', () => {
  // Le fixture sono l'artefatto che i due repo condividono: qui si verifica che
  // siano davvero ciò che il worker emette, lato Watchtower che siano accettate
  // dallo schema. Senza i due lati, una fixture può restare valida per uno solo.
  const fixtureDir = resolve(import.meta.dirname, '../../../../../../contracts/runbook-automation/v1/owned/fixtures');

  it('the known-case fixture survives the worker adapter unchanged', async () => {
    const fixture = JSON.parse(
      await readFile(resolve(fixtureDir, 'analysis-draft.known-case.json'), 'utf8'),
    ) as AnalysisDraftV1;
    assert.deepEqual(toCompleteAnalysisDraft(fixture), fixture);
  });

  it('the unknown-context fixture survives the worker adapter unchanged', async () => {
    const fixture = JSON.parse(
      await readFile(resolve(fixtureDir, 'analysis-draft.unknown-context.json'), 'utf8'),
    ) as AnalysisDraftV1;
    assert.deepEqual(toCompleteAnalysisDraft(fixture), fixture);
  });
});
