import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import { matchingKnownErrorCodes } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { NOTIFIER_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_ERRORS } from '../knownErrors.js';

const ARCHIVING_SUSPENDED =
  'Error trying to consume a message from SQS - Unable to deserialize json as a CatalogDescriptorState: "ArchivingSuspended"';
const ORGANIZATION_NOT_FOUND =
  'Error trying to consume a message from SQS - No organizationId found associated to 49cd911d-17f4-4955-93cb-d103b82cbdf2';

describe('INTEROP notifier known errors', () => {
  it('matches ArchivingSuspended only in prod application evidence', () => {
    const rows = podLogRows(alarm.podApp, [ARCHIVING_SUSPENDED]);
    for (const environment of ['prod', 'att', 'test']) {
      assert.deepStrictEqual(
        matchingKnownErrorCodes(
          KNOWN_ERRORS,
          conditionContext([[alarm.stepIds.queryApplicationLogs, rows]], environment),
        ),
        environment === 'prod' ? ['INTEROP_K8S_K8IBNE_NOT-UNS-CAT-DES-STA'] : [],
      );
    }
  });

  it('matches a dynamic organization UUID only in test CID tracker evidence', () => {
    const rows = podLogRows(alarm.podApp, [JSON.stringify({ log: ORGANIZATION_NOT_FOUND })]);
    for (const environment of ['prod', 'att', 'test']) {
      const context = conditionContext([[alarm.stepIds.queryCidTracker, cidTrackerOutput(rows)]], environment);
      assert.strictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, context).length, environment === 'test' ? 1 : 0);
    }
  });

  it('does not match an invalid organization identifier or another descriptor state', () => {
    const rows = podLogRows(alarm.podApp, [
      'Error trying to consume a message from SQS - Unable to deserialize json as a CatalogDescriptorState: "Published"',
      'Error trying to consume a message from SQS - No organizationId found associated to unknown',
    ]);
    for (const environment of ['prod', 'test']) {
      const context = conditionContext([[alarm.stepIds.queryApplicationLogs, rows]], environment);
      assert.deepStrictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, context), []);
    }
  });
});
