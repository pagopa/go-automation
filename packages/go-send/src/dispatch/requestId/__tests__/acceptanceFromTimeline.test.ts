import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { SENDTimelineElement } from '../../../services/timeline/models/SENDTimelineElement.js';
import { acceptanceFromTimeline } from '../acceptanceFromTimeline.js';

function element(category: string): SENDTimelineElement {
  return { category, timelineElementId: `${category}.IUN_X`, timestamp: '2026-01-01T00:00:00Z' };
}

describe('acceptanceFromTimeline', () => {
  it('reads REFUSED from REQUEST_REFUSED, whatever else the timeline holds', () => {
    assert.equal(
      acceptanceFromTimeline([element('VALIDATE_NORMALIZE_ADDRESSES_REQUEST'), element('REQUEST_REFUSED')]),
      'REFUSED',
    );
    assert.equal(acceptanceFromTimeline([element('REQUEST_REFUSED'), element('REQUEST_ACCEPTED')]), 'REFUSED');
  });

  it('reads ACCEPTED from the categories SEND writes only after accepting', () => {
    for (const category of [
      'REQUEST_ACCEPTED',
      'PREPARE_ANALOG_DOMICILE',
      'PREPARE_DIGITAL_DOMICILE',
      'DIGITAL_SUCCESS_WORKFLOW',
      'DIGITAL_FAILURE_WORKFLOW',
      'ANALOG_SUCCESS_WORKFLOW',
      'ANALOG_FAILURE_WORKFLOW',
      'COMPLETELY_UNREACHABLE',
      'NOTIFICATION_CANCELLED',
    ]) {
      assert.equal(
        acceptanceFromTimeline([element('SENDER_ACK_CREATION_REQUEST'), element(category)]),
        'ACCEPTED',
        category,
      );
    }
  });

  it('gives nothing for an empty timeline or one still before the acceptance', () => {
    assert.equal(acceptanceFromTimeline([]), undefined);
    assert.equal(
      acceptanceFromTimeline([
        element('SENDER_ACK_CREATION_REQUEST'),
        element('VALIDATE_NORMALIZE_ADDRESSES_REQUEST'),
        element('NORMALIZED_ADDRESS'),
        element('VALIDATED_F24'),
      ]),
      undefined,
    );
  });
});
