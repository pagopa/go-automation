import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { KnownCase } from '../../../../../engine/types/KnownCase.js';
import type { KnownCaseAnalysis } from '../../KnownCaseAnalysis.js';
import type { Runbook } from '../../../../../engine/types/Runbook.js';
import type { RunbookAnalysisDefaults } from '../../RunbookAnalysisDefaults.js';
import { INTEROP_DOWNSTREAMS } from '../../../../interop/analysis/INTEROP_DOWNSTREAMS.js';
import { SEND_DOWNSTREAMS } from '../../../../send/analysis/SEND_DOWNSTREAMS.js';
import { assertAnalysisAnnotations } from '../assertAnalysisAnnotations.js';

const SEND_CATALOG: ReadonlySet<string> = new Set<string>(Object.values(SEND_DOWNSTREAMS));

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

    assert.doesNotThrow(() => assertAnalysisAnnotations(runbook, 'SEND', SEND_CATALOG));
  });

  it('rejects a downstream taken from the catalog of another product', () => {
    // 'Selfcare' is an INTEROP census row; SEND spells it 'SelfCare'.
    const runbook = buildRunbook({
      defaults: {},
      analysis: { ...VALID_ANALYSIS, downstreams: [INTEROP_DOWNSTREAMS.SELFCARE] },
    });

    assert.throws(() => assertAnalysisAnnotations(runbook, 'SEND', SEND_CATALOG), /outside the SEND catalog/);
  });

  it('requires the annotation on every known case', () => {
    const runbook: Runbook = {
      ...buildRunbook({ defaults: {}, analysis: VALID_ANALYSIS }),
      knownCases: [knownCase('annotated', VALID_ANALYSIS), knownCase('bare', undefined)],
    };

    assert.throws(
      () => assertAnalysisAnnotations(runbook, 'SEND', SEND_CATALOG),
      /known case "bare" is missing the analysis/,
    );
  });

  it('requires it even when the runbook declares no defaults', () => {
    const runbook: Runbook = {
      ...buildRunbook({ defaults: undefined, analysis: undefined }),
      knownCases: [knownCase('bare', undefined)],
    };

    assert.throws(
      () => assertAnalysisAnnotations(runbook, 'SEND', SEND_CATALOG),
      /known case "bare" is missing the analysis/,
    );
  });

  it('rejects an IGNORABLE case without an ignore reason', () => {
    const runbook = buildRunbook({
      defaults: {},
      analysis: { ...VALID_ANALYSIS, analysisType: 'IGNORABLE' },
    });

    assert.throws(
      () => assertAnalysisAnnotations(runbook, 'SEND', SEND_CATALOG),
      /IGNORABLE without an ignoreReasonCode/,
    );
  });

  it('rejects an empty resolution', () => {
    const runbook = buildRunbook({ defaults: {}, analysis: { ...VALID_ANALYSIS, resolution: '   ' } });

    assert.throws(() => assertAnalysisAnnotations(runbook, 'SEND', SEND_CATALOG), /empty resolution/);
  });

  it('enforces the 255 character bound on the default runbook name', () => {
    const atLimit = buildRunbook({ defaults: { runbookName: 'a'.repeat(255) }, analysis: VALID_ANALYSIS });
    const overLimit = buildRunbook({ defaults: { runbookName: 'a'.repeat(256) }, analysis: VALID_ANALYSIS });

    assert.doesNotThrow(() => assertAnalysisAnnotations(atLimit, 'SEND', SEND_CATALOG));
    assert.throws(
      () => assertAnalysisAnnotations(overLimit, 'SEND', SEND_CATALOG),
      /runbookName.*exceeds 255 characters/,
    );
  });

  it('validates resource type bounds in defaults as it does in known cases', () => {
    const atLimit = buildRunbook({
      defaults: { resources: [{ name: 'pn-delivery', type: 'a'.repeat(255) }] },
      analysis: VALID_ANALYSIS,
    });
    const overLimit = buildRunbook({
      defaults: { resources: [{ name: 'pn-delivery', type: 'a'.repeat(256) }] },
      analysis: VALID_ANALYSIS,
    });
    const blank = buildRunbook({
      defaults: { resources: [{ name: 'pn-delivery', type: '   ' }] },
      analysis: VALID_ANALYSIS,
    });

    assert.doesNotThrow(() => assertAnalysisAnnotations(atLimit, 'SEND', SEND_CATALOG));
    assert.throws(() => assertAnalysisAnnotations(overLimit, 'SEND', SEND_CATALOG), /declares an invalid type/);
    assert.throws(() => assertAnalysisAnnotations(blank, 'SEND', SEND_CATALOG), /declares an invalid type/);
  });

  it('rejects a link that is not an http/https URL', () => {
    const runbook = buildRunbook({
      defaults: {},
      analysis: { ...VALID_ANALYSIS, links: [{ url: 'ftp://example.invalid/doc' }] },
    });

    assert.throws(() => assertAnalysisAnnotations(runbook, 'SEND', SEND_CATALOG), /is not an http\/https URL/);
  });

  it('requires a complete absolute URL and enforces its 2000 character bound', () => {
    const prefix = 'https://example.test/';
    const urlAtLimit = `${prefix}${'a'.repeat(2_000 - prefix.length)}`;
    const valid = buildRunbook({
      defaults: { links: [{ url: urlAtLimit }] },
      analysis: VALID_ANALYSIS,
    });
    const incomplete = buildRunbook({
      defaults: { links: [{ url: 'https://' }] },
      analysis: VALID_ANALYSIS,
    });
    const overLimit = buildRunbook({
      defaults: { links: [{ url: `${urlAtLimit}a` }] },
      analysis: VALID_ANALYSIS,
    });

    assert.doesNotThrow(() => assertAnalysisAnnotations(valid, 'SEND', SEND_CATALOG));
    assert.throws(() => assertAnalysisAnnotations(incomplete, 'SEND', SEND_CATALOG), /is not an http\/https URL/);
    assert.throws(() => assertAnalysisAnnotations(overLimit, 'SEND', SEND_CATALOG), /URL exceeds 2000 characters/);
  });

  it('rejects ignore details without a reason code', () => {
    const runbook = buildRunbook({
      defaults: {},
      analysis: { ...VALID_ANALYSIS, ignoreDetails: { diagnostic: 'already resolved' } },
    });

    assert.throws(
      () => assertAnalysisAnnotations(runbook, 'SEND', SEND_CATALOG),
      /declares ignoreDetails without an ignoreReasonCode/,
    );
  });

  it('rejects a name over the 255 character registry bound', () => {
    const runbook = buildRunbook({
      defaults: {},
      analysis: { ...VALID_ANALYSIS, finalActions: ['a'.repeat(256)] },
    });

    assert.throws(() => assertAnalysisAnnotations(runbook, 'SEND', SEND_CATALOG), /exceeds 255 characters/);
  });

  it('rejects duplicate final actions in a single declaration', () => {
    const runbook = buildRunbook({
      defaults: {},
      analysis: { ...VALID_ANALYSIS, finalActions: ['Nessuna azione', 'Nessuna azione'] },
    });

    assert.throws(() => assertAnalysisAnnotations(runbook, 'SEND', SEND_CATALOG), /duplicate names/);
  });

  it('rejects conflicting resource metadata across defaults and known cases', () => {
    const runbook = buildRunbook({
      defaults: { resources: [{ name: 'pn-delivery', type: 'Service', role: 'PRIMARY' }] },
      analysis: {
        ...VALID_ANALYSIS,
        resources: [{ name: 'pn-delivery', type: 'Lambda', role: 'CASE_RELATED' }],
      },
    });

    assert.throws(
      () => assertAnalysisAnnotations(runbook, 'SEND', SEND_CATALOG),
      /resource "pn-delivery" has conflicting metadata/,
    );
  });

  it('rejects conflicting link metadata across defaults and known cases', () => {
    const url = 'https://example.test/dashboard';
    const runbook = buildRunbook({
      defaults: { links: [{ url, name: 'Dashboard generale', type: 'dashboard' }] },
      analysis: { ...VALID_ANALYSIS, links: [{ url, name: 'Dashboard del caso', type: 'dashboard' }] },
    });

    assert.throws(() => assertAnalysisAnnotations(runbook, 'SEND', SEND_CATALOG), /link ".+" has conflicting metadata/);
  });

  it('allows an identical resource or link to be repeated across declarations', () => {
    const resource = { name: 'pn-delivery', type: 'Service', role: 'PRIMARY' as const };
    const link = { url: 'https://example.test/dashboard', name: 'Dashboard', type: 'dashboard' };
    const runbook = buildRunbook({
      defaults: { resources: [resource], links: [link] },
      analysis: { ...VALID_ANALYSIS, resources: [resource], links: [link] },
    });

    assert.doesNotThrow(() => assertAnalysisAnnotations(runbook, 'SEND', SEND_CATALOG));
  });

  it('does not add every mutually exclusive resolution to the same potential draft', () => {
    const runbook: Runbook = {
      ...buildRunbook({ defaults: {}, analysis: VALID_ANALYSIS }),
      knownCases: Array.from({ length: 40 }, (_unused, index) =>
        knownCase(`case-${index}`, { ...VALID_ANALYSIS, resolution: 'x'.repeat(4_000) }),
      ),
    };

    assert.doesNotThrow(() => assertAnalysisAnnotations(runbook, 'SEND', SEND_CATALOG));
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

    assert.throws(() => assertAnalysisAnnotations(runbook, 'SEND', SEND_CATALOG), /over the 64 KiB budget/);
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
    fallbackAction: { type: 'log', level: 'info', title: 'fallback' },
    ...(options.defaults === undefined ? {} : { analysisDefaults: options.defaults }),
  };
}

function knownCase(id: string, analysis: KnownCaseAnalysis | undefined): KnownCase {
  return {
    id,
    description: id,
    priority: 100,
    condition: { type: 'contains', ref: 'steps.query', regex: 'boom' },
    action: { type: 'log', level: 'info', title: `[CASO NOTO] ${id}` },
    ...(analysis === undefined ? {} : { analysis }),
  };
}
