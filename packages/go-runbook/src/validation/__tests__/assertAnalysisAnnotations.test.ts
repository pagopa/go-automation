import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { KnownCase } from '../../types/KnownCase.js';
import type { KnownCaseAnalysis } from '../../types/KnownCaseAnalysis.js';
import type { Runbook } from '../../types/Runbook.js';
import type { RunbookAnalysisDefaults } from '../../types/RunbookAnalysisDefaults.js';
import { INTEROP_DOWNSTREAMS } from '../../analysis/downstreams/INTEROP_DOWNSTREAMS.js';
import { SEND_DOWNSTREAMS } from '../../analysis/downstreams/SEND_DOWNSTREAMS.js';
import { assertAnalysisAnnotations } from '../assertAnalysisAnnotations.js';

const VALID_ANALYSIS: KnownCaseAnalysis = {
  resolution: 'Chiusura - caso noto.',
  proposedStatus: 'COMPLETED',
  analysisType: 'ANALYZABLE',
};

describe('assertAnalysisAnnotations', () => {
  it('accepts an annotated runbook whose downstreams belong to its product', () => {
    const runbook = buildRunbook({
      defaults: { resources: [{ name: 'pn-delivery', type: 'Service', role: 'PRIMARY' }] },
      analysis: { ...VALID_ANALYSIS, downstreams: [SEND_DOWNSTREAMS.APP_IO] },
    });

    assert.doesNotThrow(() => assertAnalysisAnnotations(runbook, 'SEND'));
  });

  it('rejects a downstream taken from the catalog of another product', () => {
    // 'Selfcare' is an INTEROP census row; SEND spells it 'SelfCare'.
    const runbook = buildRunbook({
      defaults: {},
      analysis: { ...VALID_ANALYSIS, downstreams: [INTEROP_DOWNSTREAMS.SELFCARE] },
    });

    assert.throws(() => assertAnalysisAnnotations(runbook, 'SEND'), /outside the SEND catalog/);
  });

  it('requires the annotation on every known case', () => {
    const runbook: Runbook = {
      ...buildRunbook({ defaults: {}, analysis: VALID_ANALYSIS }),
      knownCases: [knownCase('annotated', VALID_ANALYSIS), knownCase('bare', undefined)],
    };

    assert.throws(() => assertAnalysisAnnotations(runbook, 'SEND'), /known case "bare" is missing the analysis/);
  });

  it('requires it even when the runbook declares no defaults', () => {
    const runbook: Runbook = {
      ...buildRunbook({ defaults: undefined, analysis: undefined }),
      knownCases: [knownCase('bare', undefined)],
    };

    assert.throws(() => assertAnalysisAnnotations(runbook, 'SEND'), /known case "bare" is missing the analysis/);
  });

  it('rejects an IGNORABLE case without an ignore reason', () => {
    const runbook = buildRunbook({
      defaults: {},
      analysis: { ...VALID_ANALYSIS, analysisType: 'IGNORABLE' },
    });

    assert.throws(() => assertAnalysisAnnotations(runbook, 'SEND'), /IGNORABLE without an ignoreReasonCode/);
  });

  it('rejects an empty resolution', () => {
    const runbook = buildRunbook({ defaults: {}, analysis: { ...VALID_ANALYSIS, resolution: '   ' } });

    assert.throws(() => assertAnalysisAnnotations(runbook, 'SEND'), /empty resolution/);
  });

  it('rejects a link that is not an http/https URL', () => {
    const runbook = buildRunbook({
      defaults: {},
      analysis: { ...VALID_ANALYSIS, links: [{ url: 'ftp://example.invalid/doc' }] },
    });

    assert.throws(() => assertAnalysisAnnotations(runbook, 'SEND'), /is not an http\/https URL/);
  });

  it('rejects a name over the 255 character registry bound', () => {
    const runbook = buildRunbook({
      defaults: {},
      analysis: { ...VALID_ANALYSIS, finalActions: ['a'.repeat(256)] },
    });

    assert.throws(() => assertAnalysisAnnotations(runbook, 'SEND'), /exceeds 255 characters/);
  });

  it('rejects duplicate final actions in a single declaration', () => {
    const runbook = buildRunbook({
      defaults: {},
      analysis: { ...VALID_ANALYSIS, finalActions: ['Nessuna azione', 'Nessuna azione'] },
    });

    assert.throws(() => assertAnalysisAnnotations(runbook, 'SEND'), /duplicate names/);
  });

  it('does not add every mutually exclusive resolution to the same potential draft', () => {
    const runbook: Runbook = {
      ...buildRunbook({ defaults: {}, analysis: VALID_ANALYSIS }),
      knownCases: Array.from({ length: 40 }, (_unused, index) =>
        knownCase(`case-${index}`, { ...VALID_ANALYSIS, resolution: 'x'.repeat(4_000) }),
      ),
    };

    assert.doesNotThrow(() => assertAnalysisAnnotations(runbook, 'SEND'));
  });

  it('rejects a real potential draft that exceeds the raw budget', () => {
    const runbook = buildRunbook({
      defaults: {},
      analysis: {
        ...VALID_ANALYSIS,
        analysisType: 'IGNORABLE',
        ignoreReasonCode: 'OTHER',
        ignoreDetails: { diagnostic: 'x'.repeat(70_000) },
      },
    });

    assert.throws(() => assertAnalysisAnnotations(runbook, 'SEND'), /over the 64 KiB budget/);
  });
});

interface RunbookFixtureOptions {
  readonly defaults: RunbookAnalysisDefaults | undefined;
  readonly analysis: KnownCaseAnalysis | undefined;
}

function buildRunbook(options: RunbookFixtureOptions): Runbook {
  return {
    metadata: {
      id: 'test-runbook',
      name: 'Test runbook',
      description: 'fixture',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: [],
    },
    steps: [],
    knownCases: [knownCase('primary', options.analysis)],
    fallbackAction: { type: 'log', level: 'info', message: 'fallback' },
    ...(options.defaults === undefined ? {} : { analysisDefaults: options.defaults }),
  };
}

function knownCase(id: string, analysis: KnownCaseAnalysis | undefined): KnownCase {
  return {
    id,
    description: id,
    priority: 100,
    condition: { type: 'contains', ref: 'steps.query', regex: 'boom' },
    action: { type: 'log', level: 'info', message: `[CASO NOTO] ${id}` },
    ...(analysis === undefined ? {} : { analysis }),
  };
}
