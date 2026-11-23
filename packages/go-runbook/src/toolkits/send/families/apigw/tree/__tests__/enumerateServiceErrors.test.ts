import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { enumerateServiceErrors } from '../enumerateServiceErrors.js';
import { KnownUrlsRegistry } from '../../../../../common/parsing/knownUrls/KnownUrlsRegistry.js';
import { SEND_API_GW_PROFILE } from '../../profiles/SEND_API_GW_PROFILE.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import type { ServiceErrorLevelConfig } from '../ServiceErrorLevelConfig.js';

const TRACE = '1-6ade89e7-1881f1cf24c5edf61cb105cf';

/** An ERROR row of pn-delivery of the trace. */
function errorRow(pointer: string, message: string, time: string): ReadonlyArray<{ field: string; value: string }> {
  return [
    { field: '@timestamp', value: time },
    { field: '@ptr', value: pointer },
    { field: 'level', value: 'ERROR' },
    { field: '@message', value: message },
    { field: 'trace_id', value: TRACE },
  ];
}

function config(mergeIdenticalErrors: boolean): ServiceErrorLevelConfig {
  return {
    readStepId: 'query-log-pn-delivery',
    varPrefix: 'delivery',
    schema: SEND_API_GW_PROFILE.serviceLog.schema,
    registry: new KnownUrlsRegistry([]),
    traceIdContextVar: 'xRayTraceId',
    ...(mergeIdenticalErrors ? { mergeIdenticalErrors } : {}),
  };
}

/** A JSON log line of pn-delivery, as B2B writes it: its own time and stack trace around the same message. */
function jsonLine(message: string, time: string, stack: string): string {
  return JSON.stringify({ '@timestamp': time, level: 'ERROR', message, stack_trace: stack, trace_id: TRACE });
}

const ROWS = [
  errorRow(
    'p2',
    jsonLine('Error during retrieve of the groups', '2026-10-25T23:00:02Z', 'at A'),
    '2026-10-25 23:00:02.000',
  ),
  errorRow(
    'p1',
    jsonLine('Error during retrieve of the groups', '2026-10-25T23:00:01Z', 'at B'),
    '2026-10-25 23:00:01.000',
  ),
  errorRow('p3', jsonLine('NullPointerException', '2026-10-25T23:00:03Z', 'at C'), '2026-10-25 23:00:03.000'),
];

describe('enumerateServiceErrors', () => {
  it('makes one node of the identical errors of a request when the level merges them', () => {
    const { nodes } = enumerateServiceErrors(config(true))({
      context: createTestContext(),
      rows: ROWS,
      identifier: { kind: 'traceId', value: TRACE },
    });

    assert.strictEqual(nodes.length, 2);
    const [repeated, other] = nodes;
    assert.strictEqual(repeated?.occurrences, 2);
    assert.strictEqual(repeated?.scopedOutputs['query-log-pn-delivery']?.length, 2);
    assert.strictEqual(repeated?.occurredAt, '2026-10-25T23:00:01.000Z');
    assert.strictEqual(other?.occurrences, undefined);
  });

  it('keeps a node per error row when the level does not merge them', () => {
    const { nodes } = enumerateServiceErrors(config(false))({
      context: createTestContext(),
      rows: ROWS,
      identifier: { kind: 'traceId', value: TRACE },
    });

    assert.strictEqual(nodes.length, 3);
  });
});
