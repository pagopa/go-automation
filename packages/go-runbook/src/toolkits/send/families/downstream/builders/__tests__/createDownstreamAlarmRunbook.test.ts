import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SEND_DOWNSTREAMS } from '../../../../analysis/SEND_DOWNSTREAMS.js';
import type { DownstreamSelector } from '../../types/DownstreamSelector.js';
import { createDownstreamAlarmRunbook } from '../createDownstreamAlarmRunbook.js';

function build(downstream: DownstreamSelector): string {
  const runbook = createDownstreamAlarmRunbook({
    id: 'probe-downstream-detection-Alarm',
    metadata: { name: 'probe', description: '', version: '1.0.0', type: 'alarm-resolution', team: 'GO', tags: [] },
    service: { name: 'pn-probe', varPrefix: 'probe', logGroup: '/aws/ecs/pn-probe' },
    downstream,
    knownCases: [],
  });
  return JSON.stringify(runbook);
}

describe('createDownstreamAlarmRunbook — scan options (EVO-RBREORG-OPUS-01 R4)', () => {
  it('forwards the structured marker field: no raw @message predicate in the scan', () => {
    const runbook = build({
      kind: 'named',
      name: SEND_DOWNSTREAMS.SELFCARE,
      emittedAs: 'SelfcarePA',
      markerField: 'message',
      projection: ['@timestamp', 'message'],
    });
    assert.ok(runbook.includes("message like '[DOWNSTREAM] Service SelfcarePA returned errors='"));
    assert.ok(!runbook.includes("@message like '[DOWNSTREAM]"));
  });

  it('accepts up to one result page of rows and rejects more, since the scan does not paginate', () => {
    assert.ok(build({ kind: 'named', name: SEND_DOWNSTREAMS.SELFCARE, resultLimit: 10_000 }).includes('limit 10000'));
    assert.throws(
      () => build({ kind: 'named', name: SEND_DOWNSTREAMS.SELFCARE, resultLimit: 10_001 }),
      /exceeds 10000.*does not paginate/u,
    );
    assert.throws(() => build({ kind: 'any', resultLimit: 20_000 }), /exceeds 10000/u);
  });

  it('rejects exact-marker options on an any-service selector built dynamically', () => {
    const dynamic = { kind: 'any', markerField: 'message' } as unknown as DownstreamSelector;
    assert.throws(() => build(dynamic), /markerField require a 'named' downstream selector/u);
    const several = { kind: 'any', matchStructuredMessage: true, emittedAs: 'X' } as unknown as DownstreamSelector;
    assert.throws(() => build(several), /emittedAs, matchStructuredMessage require/u);
  });
});
