import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { KNOWN_CASES } from '../knownCases.js';
import { lambda } from '../../../../../toolkits/send/index.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { caseMatches, matchingCaseIds, knownCaseById } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';

function contextWithError(message: string): ReturnType<typeof createTestContext> {
  return createTestContext({
    stepResults: {
      'query-lambda-errors': [logRow({ '@requestId': '5761d2d6-a0a6-40df-afab-357b640d31b2', '@message': message })],
    },
  });
}

describe('SenderDashboardDataIndexer known cases', () => {
  it('matches the stale-data, missing-object and undersized-file messages of the verified implementation', () => {
    for (const [id, message] of [
      ['sender-dashboard-data-older-than-threshold', 'ERROR No data in the last 5 days. Last data date: 2024-05-08'],
      [
        'sender-dashboard-datalake-object-not-found',
        'ERROR Object not found: send/dashboard_mittenti/json/export-notifications_overview.json in bucket pdnd-example',
      ],
      ['sender-dashboard-datalake-file-too-small', 'ERROR File size is less than the minimum size: 1000000 bytes'],
    ] as const) {
      assert.strictEqual(caseMatches(knownCaseById(KNOWN_CASES, id), contextWithError(message)), true, id);
    }
  });

  it('does not classify an unrelated application error as a document-specific case', () => {
    const runtimeIds = new Set(lambda.LAMBDA_RUNTIME_KNOWN_CASES.map(({ id }) => id));
    const documentCases = KNOWN_CASES.filter((knownCase) => !runtimeIds.has(knownCase.id));
    assert.deepStrictEqual(
      matchingCaseIds(documentCases, contextWithError('ERROR Unexpected application failure')),
      [],
    );
  });
});
