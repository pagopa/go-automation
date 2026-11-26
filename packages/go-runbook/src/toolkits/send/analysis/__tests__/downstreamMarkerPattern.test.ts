import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { downstreamMarkerPattern } from '../downstreamMarkerPattern.js';

describe('downstreamMarkerPattern', () => {
  it('matches the marker of a service, with the status, method and escaped endpoint of the call', () => {
    const pattern = downstreamMarkerPattern('AdE', {
      status: '500 Internal Server Error',
      method: 'POST',
      endpoint: 'https://ade.example.it/ws?x=1',
    });
    assert.strictEqual(
      pattern,
      '\\[DOWNSTREAM\\] Service AdE returned errors=500 Internal Server Error from POST https://ade\\.example\\.it/ws\\?x=1',
    );
    const regex = new RegExp(pattern, 'u');
    assert.ok(
      regex.test(
        '[DOWNSTREAM] Service AdE returned errors=500 Internal Server Error from POST https://ade.example.it/ws?x=1',
      ),
    );
    assert.ok(
      !regex.test(
        '[DOWNSTREAM] Service AdE returned errors=500 Internal Server Error from POST https://adeXexample.it/ws?x=1',
      ),
    );
  });

  it('keeps the method a fragment and ends at the marker without parts', () => {
    assert.ok(
      new RegExp(
        downstreamMarkerPattern('IO', { status: '500 Internal Server Error', method: '(POST|PUT)' }),
        'u',
      ).test('[DOWNSTREAM] Service IO returned errors=500 Internal Server Error from PUT https://io'),
    );
    assert.strictEqual(downstreamMarkerPattern('POSTEL'), '\\[DOWNSTREAM\\] Service POSTEL returned errors=');
  });
});
