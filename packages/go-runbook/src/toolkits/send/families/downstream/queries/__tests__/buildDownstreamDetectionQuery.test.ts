import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DownstreamDetectionQueryOptions } from '../buildDownstreamDetectionQuery.js';
import { buildDownstreamDetectionQuery } from '../buildDownstreamDetectionQuery.js';

describe('buildDownstreamDetectionQuery', () => {
  it('builds the optimized IPA query with the 404 exclusion', () => {
    assert.strictEqual(
      buildDownstreamDetectionQuery({ downstreamName: 'IPA', excludedStatusCodes: [404] }),
      `filter @message like '[DOWNSTREAM] Service IPA returned errors='
    and @message not like '[DOWNSTREAM] Service IPA returned errors=404'
| fields @timestamp, level, trace_id, message, @message
| sort @timestamp asc
| limit 1000`,
    );
  });

  it('deduplicates and orders excluded status codes deterministically', () => {
    const query = buildDownstreamDetectionQuery({
      downstreamName: 'POSTEL',
      excludedStatusCodes: [503, 404, 503],
      resultLimit: 250,
    });

    assert.match(query, /errors=404'\n {4}and @message not like .*errors=503'/);
    assert.match(query, /\| limit 250$/);
  });

  it('escapes a downstream name before interpolating it into the query', () => {
    const query = buildDownstreamDetectionQuery({ downstreamName: "Partner's API" });

    assert.match(query, /Partner\\'s API/);
  });

  it('builds the generic query for alarms covering every emitted service name', () => {
    assert.strictEqual(
      buildDownstreamDetectionQuery({ matchAnyService: true }),
      `filter level = 'ERROR'
    and @message like '[DOWNSTREAM]'
    and @message like 'returned errors='
| fields @timestamp, level, trace_id, message, @message
| sort @timestamp asc
| limit 1000`,
    );
  });

  it('rejects invalid options', () => {
    assert.throws(() => buildDownstreamDetectionQuery({ downstreamName: ' ' }), /downstreamName/);
    assert.throws(
      () => buildDownstreamDetectionQuery({ downstreamName: 'IPA', excludedStatusCodes: [99] }),
      /status codes/,
    );
    assert.throws(() => buildDownstreamDetectionQuery({ downstreamName: 'IPA', resultLimit: 0 }), /resultLimit/);
  });

  it('excludes status codes on the same field the inclusion reads', () => {
    // Left on `@message`, the exclusion would drop a record whose structured
    // `message` says `errors=500` whenever the raw event quotes a 404 anywhere
    // else — a stack trace, an embedded retry — suppressing an occurrence the
    // alarm counted. Both predicates have to read the same field.
    const structured = buildDownstreamDetectionQuery({
      downstreamName: 'IO',
      excludedStatusCodes: [404],
      matchStructuredMessage: true,
    });
    assert.match(structured, /(?<![@\w])message not like '\[DOWNSTREAM\] Service IO returned errors=404'/u);
    assert.doesNotMatch(structured, /@message not like/u);

    // Without the option the alarm counts the raw event, so the exclusion
    // stays there.
    const raw = buildDownstreamDetectionQuery({ downstreamName: 'IO', excludedStatusCodes: [404] });
    assert.match(raw, /@message not like '\[DOWNSTREAM\] Service IO returned errors=404'/u);
    assert.doesNotMatch(raw, /(?<![@\w])message not like/u);
  });

  it('rejects exact-service options on the generic variant instead of ignoring them', () => {
    // Every call here is a compile error for a typed caller: these options
    // live in the exact-service arm of the union. The assertions bypass that on
    // purpose, because the runtime guard is what protects options assembled
    // dynamically, and because an option that silently does nothing — or worse,
    // silently widens the query — is the bug being tested.
    const untyped = (options: Record<string, unknown>): string =>
      buildDownstreamDetectionQuery(options as unknown as DownstreamDetectionQueryOptions);

    // Neither variant selected: the name is mandatory in the exact arm, so a
    // typed caller cannot get here, and the message has to say what is missing
    // rather than let `.trim()` throw on undefined.
    assert.throws(() => untyped({}), /downstreamName/);

    // The strictest of the three: ignoring a downstreamName would widen the
    // query to every service rather than narrow it, so the caller would get an
    // answer to a question it did not ask.
    assert.throws(() => untyped({ matchAnyService: true, downstreamName: 'IPA' }), /mutually exclusive/);
    assert.throws(() => untyped({ matchAnyService: true, excludedStatusCodes: [404] }), /exact downstreamName/);
    assert.throws(() => untyped({ matchAnyService: true, matchStructuredMessage: true }), /exact downstreamName/);
    // `false` asks for the same thing as `true` here — neither is buildable —
    // so it must be rejected rather than read as "nothing requested".
    assert.throws(() => untyped({ matchAnyService: true, matchStructuredMessage: false }), /exact downstreamName/);
  });
});

describe('buildDownstreamDetectionQuery — declarative scan options (EVO-RBREORG-OPUS-01 R4, RBREORG-25)', () => {
  // Options assembled at runtime, outside the type: the guards must still reject them.
  const untyped = (options: Record<string, unknown>): string =>
    buildDownstreamDetectionQuery(options as unknown as DownstreamDetectionQueryOptions);

  it('searches the marker only in the structured message, with no raw @message anywhere', () => {
    const query = buildDownstreamDetectionQuery({
      downstreamName: 'SelfcarePA',
      markerField: 'message',
      errorLevelOnly: true,
      projection: ['@timestamp', 'level', 'trace_id', 'message'],
      resultLimit: 10_000,
    });
    assert.strictEqual(
      query,
      `filter level = 'ERROR'
    and message like '[DOWNSTREAM] Service SelfcarePA returned errors='
| fields @timestamp, level, trace_id, message
| sort @timestamp asc
| limit 10000`,
    );
    assert.doesNotMatch(query, /@message/u);
  });

  it('applies the exclusions to the structured field the marker is read from', () => {
    const query = buildDownstreamDetectionQuery({
      downstreamName: 'IPA',
      markerField: 'message',
      excludedStatusCodes: [404],
      projection: ['@timestamp', 'message'],
    });
    assert.match(query, /^filter message like '\[DOWNSTREAM\] Service IPA returned errors='$/mu);
    assert.match(query, /and message not like '\[DOWNSTREAM\] Service IPA returned errors=404'/u);
    assert.doesNotMatch(query, /@message/u);
  });

  it('keeps today’s query when no option is declared', () => {
    assert.strictEqual(
      buildDownstreamDetectionQuery({ downstreamName: 'IPA', markerField: '@message' }),
      buildDownstreamDetectionQuery({ downstreamName: 'IPA' }),
    );
    assert.match(
      buildDownstreamDetectionQuery({ downstreamName: 'IPA' }),
      /\| fields @timestamp, level, trace_id, message, @message\n/u,
    );
  });

  it('rejects inconsistent or malformed scan options', () => {
    assert.throws(
      () =>
        buildDownstreamDetectionQuery({ downstreamName: 'IO', markerField: 'message', matchStructuredMessage: true }),
      /drop matchStructuredMessage/u,
    );
    assert.throws(
      () => untyped({ matchAnyService: true, markerField: 'message' }),
      /markerField requires an exact downstreamName/u,
    );
    assert.throws(() => untyped({ downstreamName: 'IO', markerField: 'raw' }), /markerField must be/u);
    assert.throws(() => buildDownstreamDetectionQuery({ downstreamName: 'IO', projection: [] }), /at least one field/u);
    assert.throws(
      () => buildDownstreamDetectionQuery({ downstreamName: 'IO', projection: ['message', 'message'] }),
      /distinct Logs Insights field names/u,
    );
    assert.throws(
      () => buildDownstreamDetectionQuery({ downstreamName: 'IO', projection: ['message | limit 1'] }),
      /distinct Logs Insights field names/u,
    );
  });

  it('applies row limit and projection to the any-service variant too', () => {
    const query = buildDownstreamDetectionQuery({ matchAnyService: true, resultLimit: 50, projection: ['message'] });
    assert.match(query, /\| fields message\n/u);
    assert.match(query, /\| limit 50$/u);
  });
});
