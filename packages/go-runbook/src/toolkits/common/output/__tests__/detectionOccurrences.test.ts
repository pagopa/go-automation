import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectionOccurrences, errorsByCase } from '../detectionOccurrences.js';
import type { DetectedCaseError } from '../DetectedCaseError.js';

const ROOT = '1-6ade89e7-1881f1cf24c5edf61cb105cf';

function detected(errorKey: string, header: string, message: string, time: string, inTree = true): DetectedCaseError {
  return {
    errorKey,
    inTree,
    output: {
      code: 'selfcarepg-read-timeout',
      description: 'ReadTimeout del downstream SelfcarePG',
      firstSeenAt: time,
      lastSeenAt: time,
      evidenceRows: 48,
      errors: 1,
      resolvedMessage: message,
      observations: [
        { kind: 'requestId', value: 'req-1', observedAt: time },
        { kind: 'traceId', value: header, observedAt: time },
      ],
    },
  };
}

describe('detectionOccurrences', () => {
  it('makes one entry of the detections of one request, even with raw X-Ray headers of the same Root', () => {
    const entries = detectionOccurrences([
      detected('e1', `Root=${ROOT};Parent=a;Sampled=1`, 'timeout', '2026-10-25T23:00:02.000Z'),
      detected('e2', `Root=${ROOT};Parent=b;Sampled=1`, 'timeout on groups-all', '2026-10-25T23:00:01.000Z'),
      detected('e2', ROOT, 'timeout', '2026-10-25T23:00:03.000Z'),
    ]);

    assert.strictEqual(entries.length, 1);
    const [entry] = entries;
    assert.strictEqual(entry?.errors, 2);
    assert.strictEqual(entry.evidenceRows, 48);
    assert.strictEqual(entry.firstSeenAt, '2026-10-25T23:00:01.000Z');
    assert.strictEqual(entry.lastSeenAt, '2026-10-25T23:00:03.000Z');
    assert.strictEqual(entry.resolvedMessage, 'timeout');
    assert.deepStrictEqual(entry.resolvedMessages, ['timeout', 'timeout on groups-all']);
  });

  it('keeps every detection of the window an entry of its own, and counts the errors of each case', () => {
    const window = [
      detected('detection:0', ROOT, 'a', '2026-10-25T23:00:01.000Z', false),
      detected('detection:1', ROOT, 'b', '2026-10-25T23:00:02.000Z', false),
    ];

    assert.strictEqual(detectionOccurrences(window).length, 2);
    assert.deepStrictEqual(
      errorsByCase(window).map(({ errors }) => errors),
      [2],
    );
  });
});
