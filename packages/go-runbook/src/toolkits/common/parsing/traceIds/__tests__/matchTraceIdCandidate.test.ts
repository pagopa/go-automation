import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchTraceIdCandidate } from '../matchTraceIdCandidate.js';
import type { ServiceLogSchema } from '../../applicationLogs/ServiceLogSchema.js';

const SCHEMA: ServiceLogSchema = {
  messageFieldCandidates: ['message', '@message'],
  levelField: 'level',
  traceIdField: 'trace_id',
};
const CANONICAL = '1-68a1b2c3-0123456789abcdef01234567';
const RAW = '68a1b2c30123456789abcdef01234567';

describe('matchTraceIdCandidate', () => {
  it('reads a raw or canonical id from the trace-id field under both policies', () => {
    for (const policy of ['field', 'field-or-message'] as const) {
      assert.deepStrictEqual(matchTraceIdCandidate(new Map([['trace_id', RAW]]), SCHEMA, policy), {
        raw: RAW,
        canonical: CANONICAL,
      });
      assert.deepStrictEqual(matchTraceIdCandidate(new Map([['@trace_id', CANONICAL]]), SCHEMA, policy), {
        raw: CANONICAL,
        canonical: CANONICAL,
      });
    }
  });

  it('gives the canonical id in lowercase under both policies, also from the message', () => {
    for (const policy of ['field', 'field-or-message'] as const) {
      assert.deepStrictEqual(matchTraceIdCandidate(new Map([['trace_id', RAW.toUpperCase()]]), SCHEMA, policy), {
        raw: RAW.toUpperCase(),
        canonical: CANONICAL,
      });
    }
    const upper = CANONICAL.toUpperCase();
    assert.deepStrictEqual(
      matchTraceIdCandidate(new Map([['message', `failed ${upper}`]]), SCHEMA, 'field-or-message'),
      { raw: upper, canonical: CANONICAL },
    );
  });

  it('field-or-message: a field with other fields after the id leaves the message to decide', () => {
    const other = '1-00000000-111111111111111111111111';
    assert.deepStrictEqual(
      matchTraceIdCandidate(
        new Map([
          ['trace_id', `${CANONICAL};Sampled=1`],
          ['message', `failed ${other}`],
        ]),
        SCHEMA,
        'field-or-message',
      ),
      { raw: other, canonical: other },
    );
  });

  it('reads every kind of tracing id from the trace-id field, a traceId:<uuid> also from the message', () => {
    const uuid = 'c84c10f5-c213-44bd-9d46-e71204834571';
    for (const policy of ['field', 'field-or-message'] as const) {
      assert.deepStrictEqual(matchTraceIdCandidate(new Map([['trace_id', `traceId:${uuid}`]]), SCHEMA, policy), {
        raw: `traceId:${uuid}`,
        canonical: `traceId:${uuid}`,
      });
      assert.deepStrictEqual(matchTraceIdCandidate(new Map([['trace_id', `FALLBACK-UUID:${uuid}`]]), SCHEMA, policy), {
        raw: `FALLBACK-UUID:${uuid}`,
        canonical: `FALLBACK-UUID:${uuid}`,
      });
    }
    assert.deepStrictEqual(
      matchTraceIdCandidate(new Map([['message', `failed traceId:${uuid}`]]), SCHEMA, 'field-or-message'),
      { raw: `traceId:${uuid}`, canonical: `traceId:${uuid}` },
    );
    assert.strictEqual(
      matchTraceIdCandidate(new Map([['message', `calling FALLBACK-UUID:${uuid}`]]), SCHEMA, 'field-or-message'),
      undefined,
    );
  });

  it('field: ignores X-Ray headers and the message', () => {
    assert.strictEqual(
      matchTraceIdCandidate(new Map([['trace_id', `Root=${CANONICAL};Sampled=1`]]), SCHEMA, 'field'),
      undefined,
    );
    assert.strictEqual(
      matchTraceIdCandidate(new Map([['message', `failed ${CANONICAL}`]]), SCHEMA, 'field'),
      undefined,
    );
  });

  it('field-or-message: reads the X-Ray header root, then X-Ray or labeled ids in the message', () => {
    const header = `Root=${CANONICAL};Sampled=1`;
    assert.deepStrictEqual(matchTraceIdCandidate(new Map([['trace_id', header]]), SCHEMA, 'field-or-message'), {
      raw: header,
      canonical: CANONICAL,
    });
    assert.deepStrictEqual(
      matchTraceIdCandidate(new Map([['message', `failed ${CANONICAL}`]]), SCHEMA, 'field-or-message'),
      { raw: CANONICAL, canonical: CANONICAL },
    );
    assert.deepStrictEqual(
      matchTraceIdCandidate(new Map([['@message', `{"trace_id":"${RAW}"}`]]), SCHEMA, 'field-or-message'),
      { raw: RAW, canonical: CANONICAL },
    );
    assert.strictEqual(
      matchTraceIdCandidate(new Map([['message', `md5 ${RAW}`]]), SCHEMA, 'field-or-message'),
      undefined,
    );
  });
});
