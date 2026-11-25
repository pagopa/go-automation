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
  it('reads REFUSED from the verification or from the timeline', () => {
    assert.equal(acceptanceOf(state('REFUSED')), 'REFUSED');
    assert.equal(
      acceptanceOf(
        state('REQUEST_ID_NOT_FOUND', {
          requestIdReason: 'WORKFLOW_ENDED:REQUEST_REFUSED',
          timelineAcceptance: 'REFUSED',
        }),
      ),
      'REFUSED',
    );
  });

  it('reads REFUSED from the timeline even when the refused category was selected and found', () => {
    // --request-id-categories REQUEST_REFUSED: the row is REQUEST_ID_FOUND, the notification refused.
    assert.equal(
      acceptanceOf(state('REQUEST_ID_FOUND', { requestIdReason: 'FOUND', timelineAcceptance: 'REFUSED' })),
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

  it('reads ACCEPTED from the timeline, whatever the requestId outcome', () => {
    assert.equal(
      acceptanceOf(state('REQUEST_ID_FOUND', { requestIdReason: 'FOUND', timelineAcceptance: 'ACCEPTED' })),
      'ACCEPTED',
    );
    assert.equal(
      acceptanceOf(
        state('REQUEST_ID_NOT_FOUND', {
          requestIdReason: 'WORKFLOW_ENDED:COMPLETELY_UNREACHABLE',
          timelineAcceptance: 'ACCEPTED',
        }),
      ),
      'ACCEPTED',
    );
    assert.equal(
      acceptanceOf(state('REQUEST_ID_NOT_FOUND', { requestIdReason: 'TIMEOUT', timelineAcceptance: 'ACCEPTED' })),
      'ACCEPTED',
      'accepted, PREPARE never appeared within the timeout',
    );
  });

  it('does not infer acceptance from REQUEST_ID_FOUND or from a workflow end alone', () => {
    // The selected and end categories are configurable: finding them proves nothing.
    assert.equal(acceptanceOf(state('REQUEST_ID_FOUND', { requestIdReason: 'FOUND' })), 'UNKNOWN');
    assert.equal(
      acceptanceOf(state('REQUEST_ID_NOT_FOUND', { requestIdReason: 'WORKFLOW_ENDED:VALIDATED_F24' })),
      'UNKNOWN',
    );
  });

  it('is UNKNOWN without evidence', () => {
    assert.equal(acceptanceOf(state('SENT')), 'UNKNOWN', 'sent, not verified');
    assert.equal(acceptanceOf(state('VERIFY_TIMEOUT')), 'UNKNOWN');
    assert.equal(acceptanceOf(state('REQUEST_ID_NOT_FOUND', { requestIdReason: 'TIMEOUT' })), 'UNKNOWN');
    assert.equal(acceptanceOf(state('PENDING')), 'UNKNOWN');
  });
});
