import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchTraceIdCandidate } from '../matchTraceIdCandidate.js';
import type { ServiceLogSchema } from '../ServiceLogSchema.js';

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
