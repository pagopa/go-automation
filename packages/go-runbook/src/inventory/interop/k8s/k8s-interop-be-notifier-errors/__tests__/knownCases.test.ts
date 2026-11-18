import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../__tests__/helpers/knownCaseTesting.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { NOTIFIER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';

const ARCHIVING_SUSPENDED =
  'Error trying to consume a message from SQS - Unable to deserialize json as a CatalogDescriptorState: "ArchivingSuspended"';
const ORGANIZATION_NOT_FOUND =
  'Error trying to consume a message from SQS - No organizationId found associated to 49cd911d-17f4-4955-93cb-d103b82cbdf2';

describe('INTEROP notifier known cases', () => {
  it('matches ArchivingSuspended only in prod application evidence', () => {
    const rows = podLogRows(alarm.podApp, [ARCHIVING_SUSPENDED]);
    for (const environment of ['prod', 'att', 'test']) {
      assert.deepStrictEqual(
        matchingCaseIds(KNOWN_CASES, conditionContext([[alarm.stepIds.queryApplicationLogs, rows]], environment)),
        environment === 'prod' ? ['notifier-unsupported-catalog-descriptor-state'] : [],
      );
    }
  });

  it('matches a dynamic organization UUID only in test CID tracker evidence', () => {
    const rows = podLogRows(alarm.podApp, [JSON.stringify({ log: ORGANIZATION_NOT_FOUND })]);
    for (const environment of ['prod', 'att', 'test']) {
      const context = conditionContext([[alarm.stepIds.queryCidTracker, cidTrackerOutput(rows)]], environment);
      assert.strictEqual(matchingCaseIds(KNOWN_CASES, context).length, environment === 'test' ? 1 : 0);
    }
  });

  it('does not match an invalid organization identifier or another descriptor state', () => {
    const rows = podLogRows(alarm.podApp, [
      'Error trying to consume a message from SQS - Unable to deserialize json as a CatalogDescriptorState: "Published"',
      'Error trying to consume a message from SQS - No organizationId found associated to unknown',
    ]);
    for (const environment of ['prod', 'test']) {
      const context = conditionContext([[alarm.stepIds.queryApplicationLogs, rows]], environment);
      assert.deepStrictEqual(matchingCaseIds(KNOWN_CASES, context), []);
    }
  });
});
