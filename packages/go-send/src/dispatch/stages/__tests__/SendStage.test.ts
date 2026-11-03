import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GORateLimiter } from '@go-automation/go-common/core';

import { FakeB2BApi, httpError, transportError } from '../../__tests__/helpers/FakeB2BApi.js';
import { MemorySink } from '../../__tests__/helpers/MemorySink.js';
import { VirtualClock } from '../../__tests__/helpers/VirtualClock.js';
import type { DispatchError } from '../../DispatchError.js';
import { DocumentResolver } from '../../documents/DocumentResolver.js';
import { LocalDocumentInspector } from '../../documents/LocalDocumentInspector.js';
import { RowLedger } from '../../journal/RowLedger.js';
import type { DispatchRecord } from '../../model/DispatchRecord.js';
import { RateAdapter } from '../RateAdapter.js';
import { SendStage } from '../SendStage.js';
import { VerifyStage } from '../VerifyStage.js';

const SHARED = [
  {
    key: 'PN_NOTIFICATION_ATTACHMENTS-abc.pdf',
    versionToken: 'v1',
    sha256: '1QKD/Ks6BohyQ+bgMxHf9NrpNhVmGUPxRYE1aerU4JQ=',
    contentType: 'application/pdf',
    title: 'Atto',
  },
];

function record(rowIndex: number): DispatchRecord {
  return {
    rowIndex,
    rowKey: `S-${rowIndex}`,
    subject: 'Test',
    sender: { taxId: '00000000001', denomination: 'Comune' },
    recipient: { type: 'PF', taxId: 'RSSMRA80A01H501U', denomination: 'Mario Rossi' },
    physicalAddress: { address: 'Via Roma 1', zip: '00100', municipality: 'Roma' },
    product: 'AR',
    documents: { kind: 'shared' },
    options: { taxonomyCode: '010202N', notificationFeePolicy: 'FLAT_RATE', pagoPaIntMode: 'NONE' },
  };
}

interface Harness {
  readonly clock: VirtualClock;
  readonly api: FakeB2BApi;
  readonly sink: MemorySink;
  readonly ledger: RowLedger;
  readonly stage: SendStage;
  readonly sent: number[];
  readonly globalErrors: DispatchError[];
  readonly limiter: GORateLimiter;
}

function harness(retryAmbiguous = true): Harness {
  const clock = new VirtualClock();
  const api = new FakeB2BApi(clock);
  const sink = new MemorySink();
  const ledger = new RowLedger(sink, () => new Date(clock.now()));
  const limiter = new GORateLimiter({ ratePerSecond: 20, priorities: 2, sleeper: clock, now: () => clock.now() });
  const sent: number[] = [];
  const globalErrors: DispatchError[] = [];
  const controller = new AbortController();
  const stage = new SendStage({
    api,
    limiter,
    rateAdapter: new RateAdapter(limiter, 20, clock, true),
    ledger,
    clock,
    resolver: new DocumentResolver({ inspector: new LocalDocumentInspector(), shared: SHARED }),
    runId: 'run',
    apiVersion: 'v2.6',
    retryAmbiguous,
    sendTimeoutMs: 600_000,
    onSent: (rowIndex) => sent.push(rowIndex),
    onGlobalError: (error) => {
      globalErrors.push(error);
      controller.abort();
    },
    signal: controller.signal,
  });
  return { clock, api, sink, ledger, stage, sent, globalErrors, limiter };
}

describe('SendStage', () => {
  it('sends, journals SENDING before SENT and decodes the IUN', async () => {
    const h = harness();
    await h.clock.run(h.stage.send(record(0)));
    assert.deepEqual(
      h.sink.entries.map((entry) => entry.event),
      ['SENDING', 'SENT'],
    );
    const state = h.ledger.get(0);
    assert.equal(state?.status, 'SENT');
    assert.match(state?.iun ?? '', /^[A-Z]{4}-[A-Z]{4}-[A-Z]{4}-\d{6}-[A-Z]-\d$/);
    assert.equal(state?.paProtocolNumber, 'GO-run-S-0');
    assert.equal(state?.idempotenceToken, 'run-S-0');
    assert.deepEqual(state?.documentKeys, [SHARED[0]?.key]);
    assert.deepEqual(h.sent, [0]);
  });

  it('records a 400 as a permanent row failure', async () => {
    const h = harness();
    h.api.sendScript.push(httpError(400, { errors: [{ code: 'PN_GENERIC_INVALIDPARAMETER_PATTERN', element: 'x' }] }));
    await h.clock.run(h.stage.send(record(0)));
    assert.equal(h.ledger.get(0)?.status, 'SEND_FAILED');
    assert.equal(h.ledger.get(0)?.error?.code, 'PN_GENERIC_INVALIDPARAMETER_PATTERN');
    assert.equal(h.ledger.get(0)?.error?.retryable, false);
    assert.equal(h.globalErrors.length, 0);
  });

  it('stops the run on a global error', async () => {
    const h = harness();
    h.api.sendScript.push(httpError(403, { errors: [{ code: 'PN_DELIVERY_INVALID_SENDER_TAX_ID' }] }));
    await h.clock.run(h.stage.send(record(0)));
    await h.clock.run(h.stage.send(record(1)));
    assert.equal(h.globalErrors[0]?.code, 'PN_DELIVERY_INVALID_SENDER_TAX_ID');
    assert.equal(h.ledger.get(0)?.error?.retryable, true);
    assert.equal(h.ledger.get(1), undefined, 'no further row is sent after the stop');
    assert.equal(h.api.count('send'), 1);
  });

  it('reschedules on 429 and lowers the rate', async () => {
    const h = harness();
    h.api.sendScript.push(httpError(429, undefined, 2_000), httpError(429, undefined, 2_000));
    await h.clock.run(h.stage.send(record(0)));
    assert.equal(h.ledger.get(0)?.status, 'SENT');
    assert.equal(h.ledger.get(0)?.sendAttempts, 3);
    assert.ok(h.limiter.ratePerSecond < 20);
  });

  it('reconciles a timeout: notification found → SENT without a second POST', async () => {
    const h = harness();
    h.api.sendScript.push('created-then-timeout');
    await h.clock.run(h.stage.send(record(0)));
    assert.equal(h.ledger.get(0)?.status, 'SENT');
    assert.equal(h.api.count('send'), 1);
    assert.equal(h.api.count('lookup'), 1);
    assert.equal(h.api.created.size, 1);
    assert.deepEqual(
      h.sink.entries.map((entry) => entry.event),
      ['SENDING', 'RECONCILING', 'SENT'],
    );
  });

  it('reconciles a 503: notification not found → one new POST with the same keys', async () => {
    const h = harness();
    h.api.sendScript.push(httpError(503));
    await h.clock.run(h.stage.send(record(0)));
    assert.equal(h.ledger.get(0)?.status, 'SENT');
    assert.equal(h.api.count('send'), 2);
    assert.equal(h.api.count('lookup'), 1);
    assert.equal(h.api.created.size, 1, 'never two notifications for one row');
  });

  it('reconciles again a new POST that times out', async () => {
    const h = harness();
    h.api.sendScript.push(httpError(503), 'created-then-timeout');
    await h.clock.run(h.stage.send(record(0)));
    assert.equal(h.ledger.get(0)?.status, 'SENT');
    assert.equal(h.api.created.size, 1);
  });

  it('turns a 409 duplicate into the existing notification', async () => {
    const h = harness();
    await h.clock.run(h.stage.send(record(0)));
    const first = h.ledger.get(0)?.notificationRequestId;
    await h.clock.run(h.stage.send(record(0))); // same keys, no previous state: POST gets 409
    assert.equal(h.api.count('send'), 2);
    assert.equal(h.api.count('lookup'), 1);
    assert.equal(h.ledger.get(0)?.notificationRequestId, first);
    assert.equal(h.api.created.size, 1);
  });

  it('marks the row SEND_UNCERTAIN without reconciliation when disabled', async () => {
    const h = harness(false);
    h.api.sendScript.push(transportError());
    await h.clock.run(h.stage.send(record(0)));
    assert.equal(h.ledger.get(0)?.status, 'SEND_UNCERTAIN');
    assert.equal(h.api.count('lookup'), 0);
  });

  it('reconciles a row left SENDING by a previous session instead of posting again', async () => {
    const h = harness();
    await h.clock.run(h.stage.send(record(0)));
    const previous = { ...h.ledger.get(0)!, status: 'SENDING' as const };
    await h.clock.run(h.stage.send(record(0), previous));
    assert.equal(h.api.count('send'), 1);
    assert.equal(h.api.count('lookup'), 1);
  });

  it('spaces sends at 20/s and never exceeds 21 calls in a one-second window', async () => {
    const h = harness();
    await h.clock.run(Promise.all(Array.from({ length: 200 }, async (_, i) => h.stage.send(record(i)))));
    const times = h.api.calls.map((call) => call.at);
    assert.equal(times.length, 200);
    assert.ok(h.clock.elapsed <= 10_000, `200 sends took ${h.clock.elapsed} ms`);
    let start = 0;
    for (let end = 0; end < times.length; end++) {
      while ((times[end] ?? 0) - (times[start] ?? 0) >= 1000) start++;
      assert.ok(end - start + 1 <= 21);
    }
  });
});

describe('VerifyStage', () => {
  function verifyHarness(timeoutMs = 15 * 60_000): Harness & { readonly verify: VerifyStage } {
    const h = harness();
    const verify = new VerifyStage({
      api: h.api,
      limiter: h.limiter,
      ledger: h.ledger,
      clock: h.clock,
      apiVersion: 'v2.6',
      timeoutMs,
      onGlobalError: (error) => h.globalErrors.push(error),
      signal: new AbortController().signal,
    });
    return { ...h, verify };
  }

  it('waits while WAITING, then records ACCEPTED with the IUN', async () => {
    const h = verifyHarness();
    await h.clock.run(h.stage.send(record(0)));
    h.api.statusScript = ['WAITING', 'WAITING', 'ACCEPTED'];
    const id = h.ledger.get(0)?.notificationRequestId ?? '';
    h.verify.schedule(0, 'S-0', id);
    await h.clock.run(h.verify.drain());
    assert.equal(h.ledger.get(0)?.status, 'ACCEPTED');
    assert.equal(h.ledger.get(0)?.verifyChecks, 3);
    assert.equal(h.verify.pendingCount, 0);
  });

  it('records REFUSED with the errors', async () => {
    const h = verifyHarness();
    await h.clock.run(h.stage.send(record(0)));
    h.api.statusScript = ['REFUSED'];
    h.verify.schedule(0, 'S-0', h.ledger.get(0)?.notificationRequestId ?? '');
    await h.clock.run(h.verify.drain());
    assert.equal(h.ledger.get(0)?.status, 'REFUSED');
    assert.match(h.ledger.get(0)?.error?.details ?? '', /FILE_NOTFOUND/);
  });

  it('times out and tolerates 5xx in between', async () => {
    const h = verifyHarness(60_000);
    await h.clock.run(h.stage.send(record(0)));
    h.api.statusScript = [httpError(502), ...Array.from({ length: 20 }, () => 'WAITING' as const)];
    h.verify.schedule(0, 'S-0', h.ledger.get(0)?.notificationRequestId ?? '');
    await h.clock.run(h.verify.drain());
    assert.equal(h.ledger.get(0)?.status, 'VERIFY_TIMEOUT');
  });
});

describe('RateAdapter', () => {
  it('lowers the rate by 25% on 429 and recovers by 10% every 30 s', () => {
    const clock = new VirtualClock();
    const limiter = new GORateLimiter({ ratePerSecond: 20, sleeper: clock, now: () => clock.now() });
    const adapter = new RateAdapter(limiter, 20, clock, true);
    assert.equal(adapter.onThrottled(), 15);
    assert.equal(adapter.onSuccess(), undefined, 'not before 30 s');
    clock.advance(30_000);
    assert.equal(adapter.onSuccess(), 16.5);
    assert.equal(adapter.throttledCount, 1);
    const fixed = new RateAdapter(limiter, 20, clock, false);
    assert.equal(fixed.onThrottled(), undefined);
  });
});
