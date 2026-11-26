import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { KNOWN_CASES } from '../knownCases.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';

const CASE_ID = 'metadata-status-updater-conditional-request-failed';
// Real Lambda line: its fields are tab-separated, and the evidence is matched on the serialized row.
const CONDITIONAL_FAILURE =
  '2026-11-09T19:08:18.857Z\t21fa5737-ce73-46a3-908e-99b2f93ff639\tERROR\tError The conditional request failed processing record with sequenceNumber: 49679554986688926010577593687734760654467214509581798498\n';

function idsFor(stepId: 'query-lambda-errors' | 'query-lambda-invocation', message: string): ReadonlyArray<string> {
  const context = createTestContext({
    stepResults: { [stepId]: [logRow({ '@requestId': '21fa5737-ce73-46a3-908e-99b2f93ff639', '@message': message })] },
  });
  return matchingCaseIds(KNOWN_CASES, context);
}

describe('pn-MetadataStatusUpdaterLambda-ESM-Alarm known cases', () => {
  it('recognizes the conditional write failure of an already processed record in errors and invocation logs', () => {
    for (const stepId of ['query-lambda-errors', 'query-lambda-invocation'] as const) {
      assert.deepStrictEqual(idsFor(stepId, CONDITIONAL_FAILURE), [CASE_ID], stepId);
    }
  });

  it('does not take the INFO delete line or another processing error for the known case', () => {
    for (const message of [
      '2026-11-09T19:08:18.857Z\t21fa5737-ce73-46a3-908e-99b2f93ff639\tINFO\tDelete failed: iun does not match\n',
      '2026-11-09T19:08:18.857Z\t21fa5737-ce73-46a3-908e-99b2f93ff639\tERROR\tError Throughput exceeded processing record with sequenceNumber: 49679554986688926010577593687734760654467214509581798498\n',
      '2026-11-09T19:08:18.857Z\t21fa5737-ce73-46a3-908e-99b2f93ff639\tERROR\tError The conditional request failed processing record\n',
    ]) {
      assert.ok(!idsFor('query-lambda-errors', message).includes(CASE_ID), message);
    }
  });
});
