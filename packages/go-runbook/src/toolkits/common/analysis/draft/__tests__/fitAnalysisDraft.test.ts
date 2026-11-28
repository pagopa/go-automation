import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fitAnalysisDraft } from '../fitAnalysisDraft.js';
import type { KnownErrorAnalysisDraft } from '../KnownErrorAnalysisDraft.js';

const LIMITS = { textLength: 5_000, draftBytes: 4_000 } as const;

function draft(overrides: Partial<KnownErrorAnalysisDraft> = {}): KnownErrorAnalysisDraft {
  return {
    schemaVersion: 1,
    kind: 'KNOWN_CASE',
    conclusionNotes: '',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    resources: [],
    downstreams: [],
    finalActions: [],
    links: [],
    ...overrides,
  };
}

const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');

describe('fitAnalysisDraft', () => {
  it('measures the texts as serialized: escaped quotes and backslashes count', () => {
    const coverage = 'Evidenza incompleta: 1 fonti (sature 1)';
    const entries = Array.from({ length: 6 }, (_unused, index) => `${String(index + 1)}. "${'"\\'.repeat(200)}"`);
    const fitted = fitAnalysisDraft(
      draft({ conclusionNotes: [...entries, coverage].join('\n') }),
      { noteEntries: entries, coverageLines: [coverage], detailEntries: [] },
      LIMITS,
    );

    assert.ok(bytes(fitted) <= LIMITS.draftBytes, String(bytes(fitted)));
    assert.match(fitted.conclusionNotes, /… e altri \d+ casi \(vedi l'esecuzione\)\nEvidenza incompleta/u);
  });

  it('reserves no room for absent details, so a draft just over its envelope keeps a shortened entry', () => {
    const base = draft({ conclusionNotes: '' });
    const limit = bytes(base) + 10;
    const fitted = fitAnalysisDraft(draft({ conclusionNotes: 'ABCDEFGHIJKLMNOPQRST' }), undefined, {
      textLength: 5_000,
      draftBytes: limit,
    });
    assert.strictEqual(fitted.conclusionNotes, 'ABCDEFG…'); // «…» takes 3 of the 10 bytes
    assert.ok(bytes(fitted) <= limit);
  });

  it('drops the optional details when they take the room the shortened diagnosis needs', () => {
    const limit = bytes(draft({ conclusionNotes: '' })) + 10;
    const fitted = fitAnalysisDraft(
      draft({ conclusionNotes: 'ABCDEFGHIJKLMNOPQRST', errorDetails: 'some details' }),
      undefined,
      { textLength: 5_000, draftBytes: limit },
    );
    assert.strictEqual(fitted.errorDetails, undefined);
    assert.strictEqual(fitted.conclusionNotes, 'ABCDEFG…');
  });

  it('never returns the omission marker in place of the first diagnosis, giving up optional links first', () => {
    const entries = [`1. ${'a'.repeat(120)}`, '2. b'];
    const base = draft({ conclusionNotes: '', links: [{ url: `https://example.test/${'x'.repeat(60)}` }] });
    for (let extra = 0; extra <= 300; extra += 1) {
      const limits = { textLength: 5_000, draftBytes: bytes(base) + extra };
      try {
        const fitted = fitAnalysisDraft(
          { ...base, conclusionNotes: entries.join('\n') },
          { noteEntries: entries, coverageLines: [], detailEntries: [] },
          limits,
        );
        assert.ok(fitted.conclusionNotes.startsWith('1. '), `${String(extra)}: ${fitted.conclusionNotes}`);
        assert.ok(bytes(fitted) <= limits.draftBytes);
      } catch (error: unknown) {
        assert.match((error as Error).message, /cannot fit/u);
      }
    }
  });

  it('rejects resources or downstreams over the item limit it is given', () => {
    assert.throws(
      () =>
        fitAnalysisDraft(draft({ conclusionNotes: 'ok', resources: [{ name: 'a' }, { name: 'b' }] }), undefined, {
          textLength: 5_000,
          draftBytes: 65_536,
          arrayItems: 1,
        }),
      /2 resources, over the 1 items/u,
    );
  });

  it('keeps at most the items of a reference list for links and final actions', () => {
    const links = Array.from({ length: 70 }, (_unused, index) => ({ url: `https://example.test/${String(index)}` }));
    const fitted = fitAnalysisDraft(draft({ conclusionNotes: 'ok', links }), undefined, {
      textLength: 5_000,
      draftBytes: 65_536,
      arrayItems: 64,
    });
    assert.strictEqual(fitted.links.length, 64);
  });

  it('shortens links before giving up the start of the first entry, and fails on an impossible envelope', () => {
    const links = Array.from({ length: 40 }, (_unused, index) => ({
      url: `https://example.test/${'x'.repeat(80)}/${String(index)}`,
    }));
    const fitted = fitAnalysisDraft(draft({ conclusionNotes: `1. ${'y'.repeat(3_000)}`, links }), undefined, LIMITS);
    assert.ok(fitted.links.length < 40);
    assert.match(fitted.conclusionNotes, /^1\. y+…$/u);
    assert.ok(bytes(fitted) <= LIMITS.draftBytes);

    const resources = Array.from({ length: 64 }, (_unused, index) => ({ name: `${'r'.repeat(200)}-${String(index)}` }));
    assert.throws(
      () => fitAnalysisDraft(draft({ conclusionNotes: 'x'.repeat(10), resources }), undefined, LIMITS),
      /cannot fit/u,
    );
  });
});
