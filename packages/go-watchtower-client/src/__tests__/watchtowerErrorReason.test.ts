import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Core } from '@go-automation/go-common';

import { watchtowerErrorReason, withWatchtowerReason } from '../watchtowerErrorReason.js';

function httpError(status: number, body: unknown): Core.GOHttpClientError {
  return new Core.GOHttpClientError(`HTTP ${status}: Unprocessable Entity`, status, body, 1, undefined);
}

describe('watchtowerErrorReason', () => {
  it('reads the reason from a parsed JSON body', () => {
    const error = httpError(422, { error: 'automatic runbook catalog is unavailable or stale' });
    assert.equal(watchtowerErrorReason(error), 'automatic runbook catalog is unavailable or stale');
  });

  it('reads the reason from a raw JSON string body', () => {
    // Il client HTTP consegna il corpo parsato solo quando il content-type è
    // JSON: sull'altro percorso arriva la stringa grezza, e la causa è la stessa.
    const error = httpError(422, '{"error":"no automatic runbook capability for alarm"}');
    assert.equal(watchtowerErrorReason(error), 'no automatic runbook capability for alarm');
  });

  it('accepts message and detail as alternatives', () => {
    assert.equal(watchtowerErrorReason(httpError(401, { message: 'token scaduto' })), 'token scaduto');
    assert.equal(watchtowerErrorReason(httpError(400, { detail: 'campo non valido' })), 'campo non valido');
  });

  it('ignores a body that carries no usable reason', () => {
    assert.equal(watchtowerErrorReason(httpError(502, '<html>Bad Gateway</html>')), undefined);
    assert.equal(watchtowerErrorReason(httpError(500, {})), undefined);
    assert.equal(watchtowerErrorReason(httpError(500, undefined)), undefined);
  });
});

describe('withWatchtowerReason', () => {
  it('keeps type, status and body so the callers keep deciding as before', () => {
    const original = httpError(422, { error: 'catalogo scaduto' });
    const enriched = withWatchtowerReason(original);
    assert.ok(enriched instanceof Core.GOHttpClientError);
    assert.equal(enriched.statusCode, 422);
    assert.deepEqual(enriched.response, { error: 'catalogo scaduto' });
    assert.match(enriched.message, /HTTP 422.*catalogo scaduto/u);
  });

  it('does not duplicate a reason already present in the message', () => {
    const already = new Core.GOHttpClientError('HTTP 422: x — catalogo scaduto', 422, { error: 'catalogo scaduto' });
    assert.equal(withWatchtowerReason(already), already);
  });

  it('leaves untouched anything that is not an HTTP error', () => {
    const plain = new Error('boom');
    assert.equal(withWatchtowerReason(plain), plain);
  });
});
