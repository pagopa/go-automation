import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { acceptanceOf } from '../acceptanceOf.js';
import type { RowState } from '../RowState.js';
import type { RowStatus } from '../RowStatus.js';

function state(status: RowStatus, extra: Partial<RowState> = {}): RowState {
  return {
    rowIndex: 0,
    rowKey: 'K',
    status,
    sendAttempts: 1,
    verifyChecks: 0,
    requestIdChecks: 0,
    warnings: [],
    ...extra,
  };
}

describe('acceptanceOf', () => {
  it('reads REFUSED from the verification or from a REQUEST_REFUSED timeline', () => {
    assert.equal(acceptanceOf(state('REFUSED')), 'REFUSED');
    assert.equal(
      acceptanceOf(state('REQUEST_ID_NOT_FOUND', { requestIdReason: 'WORKFLOW_ENDED:REQUEST_REFUSED' })),
      'REFUSED',
    );
  });

  it('reads ACCEPTED from the verification, kept by the later requestId statuses', () => {
    assert.equal(acceptanceOf(state('ACCEPTED', { acceptedAt: 't' })), 'ACCEPTED');
    assert.equal(
      acceptanceOf(state('REQUEST_ID_NOT_FOUND', { acceptedAt: 't', requestIdReason: 'TIMEOUT' })),
      'ACCEPTED',
    );
  });

  it('reads ACCEPTED from timeline steps that only follow acceptance', () => {
    assert.equal(acceptanceOf(state('REQUEST_ID_FOUND', { requestIdReason: 'FOUND' })), 'ACCEPTED');
    for (const category of ['ANALOG_SUCCESS_WORKFLOW', 'COMPLETELY_UNREACHABLE', 'NOTIFICATION_CANCELLED']) {
      assert.equal(
        acceptanceOf(state('REQUEST_ID_NOT_FOUND', { requestIdReason: `WORKFLOW_ENDED:${category}` })),
        'ACCEPTED',
        category,
      );
    }
  });

  it('is UNKNOWN without evidence', () => {
    assert.equal(acceptanceOf(state('SENT')), 'UNKNOWN', 'sent, not verified');
    assert.equal(acceptanceOf(state('VERIFY_TIMEOUT')), 'UNKNOWN');
    assert.equal(acceptanceOf(state('REQUEST_ID_NOT_FOUND', { requestIdReason: 'TIMEOUT' })), 'UNKNOWN');
    assert.equal(acceptanceOf(state('PENDING')), 'UNKNOWN');
  });
});
