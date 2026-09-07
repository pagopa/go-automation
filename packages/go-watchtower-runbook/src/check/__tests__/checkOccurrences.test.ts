import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RtaCheckInput } from '../../types/RtaCheckReport.js';
import { checkOccurrences } from '../checkOccurrences.js';
import type { RunbookCheckContext } from '../checkOccurrence.js';

const reportInput: RtaCheckInput = {
  watchtowerUrl: 'https://watchtower.example',
  productId: 'product-id',
  productName: 'Product',
  alarmId: 'alarm-id',
  alarmName: 'Alarm',
  dateFrom: '2026-08-01T00:00:00.000Z',
  dateTo: '2026-08-02T00:00:00.000Z',
  awsProfiles: [],
};

describe('checkOccurrences', () => {
  it('rejects a concurrency that is not a finite positive integer', async () => {
    const invalidValues = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1, 1.5];

    for (const concurrency of invalidValues) {
      await assert.rejects(
        async () =>
          await checkOccurrences({
            context: {} as RunbookCheckContext,
            occurrences: [],
            reportInput,
            concurrency,
          }),
        /Invalid concurrency/,
      );
    }
  });

  it('accepts a positive integer when there are no occurrences', async () => {
    const report = await checkOccurrences({
      context: {} as RunbookCheckContext,
      occurrences: [],
      reportInput,
      concurrency: 1,
    });

    assert.deepStrictEqual(report.rows, []);
  });
});
