import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';

import { GORateLimiter } from '@go-automation/go-common/core';

import { FakeB2BApi, httpError, transportError } from '../../__tests__/helpers/FakeB2BApi.js';
import { MemorySink } from '../../__tests__/helpers/MemorySink.js';
import { VirtualClock } from '../../__tests__/helpers/VirtualClock.js';
import type { SENDApiVersion } from '../../../services/notification/models/SENDApiVersion.js';
import type { SENDNotificationStatusResponse } from '../../../services/notification/models/SENDNotificationStatusResponse.js';
import type { DispatchError } from '../../DispatchError.js';
import { DispatchError as DispatchErrorClass } from '../../DispatchError.js';
import { UploadError } from '../../documents/UploadError.js';
import { DocumentResolver } from '../../documents/DocumentResolver.js';
import { LocalDocumentInspector } from '../../documents/LocalDocumentInspector.js';
import { RowLedger } from '../../journal/RowLedger.js';
import type { DispatchRecord } from '../../model/DispatchRecord.js';
import { acquireUnlessStopped, sleepUnlessStopped } from '../abortableWaits.js';
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
  readonly controller: AbortController;
}

function harness(
  retryAmbiguous = true,
  resolver: DocumentResolver = new DocumentResolver({
    inspector: new LocalDocumentInspector(os.tmpdir()),
    shared: SHARED,
    placeholders: false,
  }),
): Harness {
  const clock = new VirtualClock();
  const api = new FakeB2BApi(clock);
  const sink = new MemorySink();
  const ledger = new RowLedger(sink, () => new Date(clock.now()));
  const limiter = new GORateLimiter({ ratePerSecond: 20, priorities: 2, sleeper: clock, now: () => clock.monotonic() });
  const sent: number[] = [];
  const globalErrors: DispatchError[] = [];
  const controller = new AbortController();
  const stage = new SendStage({
    api,
    limiter,
    rateAdapter: new RateAdapter(limiter, 20, clock, true),
    ledger,
    clock,
    resolver,
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
  return { clock, api, sink, ledger, stage, sent, globalErrors, limiter, controller };
}

/** Resolver whose `resolve` always rejects with `error`. */
function failingResolver(error: unknown): DocumentResolver {
  return {
    resolve: async (): Promise<never> => {
      await Promise.resolve();
      throw error;
    },
  } as unknown as DocumentResolver;
}

/** B2B API that records the abort signals of the read-only calls. */
class SignalRecordingApi extends FakeB2BApi {
  public readonly signals: (AbortSignal | undefined)[] = [];

  public override async lookup(
    paProtocolNumber: string,
    idempotenceToken: string,
    apiVersion: SENDApiVersion,
    signal?: AbortSignal,
  ): Promise<SENDNotificationStatusResponse> {
    this.signals.push(signal);
    return super.lookup(paProtocolNumber, idempotenceToken, apiVersion);
  }
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

  it('turns a 409 duplicate into the existing notification, looking it up at once', async () => {
    const h = harness();
    await h.clock.run(h.stage.send(record(0)));
    const first = h.ledger.get(0)?.notificationRequestId;
    const before = h.clock.elapsed;
    await h.clock.run(h.stage.send(record(0))); // same keys, no previous state: POST gets 409
    assert.equal(h.api.count('send'), 2);
    assert.equal(h.api.count('lookup'), 1);
    assert.equal(h.ledger.get(0)?.notificationRequestId, first);
    assert.equal(h.api.created.size, 1);
    assert.ok(h.clock.elapsed - before < 1_000, `duplicate reconciled after ${h.clock.elapsed - before} ms`);
  });

  it('records SEND_FAILED THROTTLED (retryable) when the run stops during a 429 backoff', async () => {
    const h = harness();
    h.api.sendScript.push(httpError(429, undefined, 60_000));
    const sending = h.stage.send(record(0));
    const stopper = (async (): Promise<void> => {
      await h.clock.sleep(1_000);
      h.controller.abort();
    })();
    await h.clock.run(Promise.all([sending, stopper]));
    const state = h.ledger.get(0);
    assert.equal(state?.status, 'SEND_FAILED');
    assert.equal(state?.error?.code, 'THROTTLED');
    assert.equal(state?.error?.retryable, true);
    assert.equal(h.api.count('send'), 1);
  });

  it('records a document failure on the row and stops the run when it is run-level', async () => {
    const configuration = harness(true, failingResolver(new DispatchErrorClass('CONFIGURATION', 'no gateway')));
    await configuration.clock.run(configuration.stage.send(record(0)));
    assert.equal(configuration.ledger.get(0)?.status, 'SEND_FAILED');
    assert.equal(configuration.globalErrors[0]?.code, 'CONFIGURATION');

    const rejected = harness(
      true,
      failingResolver(new UploadError('UPLOAD_REJECTED', 'preload failed', { cause: httpError(401) })),
    );
    await rejected.clock.run(rejected.stage.send(record(0)));
    assert.equal(rejected.ledger.get(0)?.error?.code, 'UPLOAD_REJECTED');
    assert.equal(rejected.globalErrors[0]?.code, 'HTTP_401', 'a preload 401 is an API key problem');

    const rowLevel = harness(
      true,
      failingResolver(new UploadError('UPLOAD_REJECTED', 'preload failed', { cause: httpError(400) })),
    );
    await rowLevel.clock.run(rowLevel.stage.send(record(0)));
    assert.equal(rowLevel.ledger.get(0)?.error?.code, 'UPLOAD_REJECTED');
    assert.equal(rowLevel.globalErrors.length, 0);

    const empty = harness(true, failingResolver(new DispatchErrorClass('PRATICA_EMPTY', 'no attachment')));
    await empty.clock.run(empty.stage.send(record(0)));
    assert.equal(empty.ledger.get(0)?.error?.retryable, false);
  });

  it('rethrows an error that is not a document problem instead of failing the row', async () => {
    const h = harness(true, failingResolver(new Error('journal write failed')));
    await assert.rejects(h.clock.run(h.stage.send(record(0))), /journal write failed/);
    assert.equal(h.ledger.get(0), undefined);
  });

  it('records nothing when the run stops while the documents are being uploaded', async () => {
    const controller = new AbortController();
    const resolver = {
      resolve: async (): Promise<never> => {
        await Promise.resolve();
        controller.abort();
        throw new UploadError('UPLOAD_FAILED', 'aborted');
      },
    } as unknown as DocumentResolver;
    const h = harness(true, resolver);
    controller.signal.addEventListener('abort', () => h.controller.abort());
    await h.clock.run(h.stage.send(record(0)));
    assert.equal(h.ledger.get(0), undefined, 'the resume sends the row');
  });

  it('passes the stop signal to the lookup and leaves the row RECONCILING when it is abandoned', async () => {
    const h = harness();
    const api = new SignalRecordingApi(h.clock);
    const stage = new SendStage({
      api,
      limiter: h.limiter,
      rateAdapter: new RateAdapter(h.limiter, 20, h.clock, true),
      ledger: h.ledger,
      clock: h.clock,
      resolver: new DocumentResolver({
        inspector: new LocalDocumentInspector(os.tmpdir()),
        shared: SHARED,
        placeholders: false,
      }),
      runId: 'run',
      apiVersion: 'v2.6',
      retryAmbiguous: true,
      sendTimeoutMs: 600_000,
      onSent: () => undefined,
      onGlobalError: () => undefined,
      signal: h.controller.signal,
    });
    api.sendScript.push(httpError(503));
    await h.clock.run(stage.send(record(0)));
    assert.equal(api.signals[0], h.controller.signal);

    api.sendScript.push(httpError(503));
    const abortingLookup = api.lookup.bind(api);
    api.lookup = async (
      paProtocolNumber: string,
      idempotenceToken: string,
      apiVersion: SENDApiVersion,
    ): Promise<SENDNotificationStatusResponse> => {
      h.controller.abort();
      await abortingLookup(paProtocolNumber, idempotenceToken, apiVersion);
      throw transportError();
    };
    await h.clock.run(stage.send(record(1)));
    assert.equal(h.ledger.get(1)?.status, 'RECONCILING', 'no SEND_UNCERTAIN for an abandoned lookup');
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

  it('starts the timeout at the first granted check, not while checks wait behind the sends', async () => {
    const h = verifyHarness(60_000);
    await h.clock.run(h.stage.send(record(0)));
    h.api.statusScript = ['WAITING', 'ACCEPTED'];
    h.limiter.setRate(1);
    // 120 sends queued at priority 0: the first check (priority 1) waits about 2 minutes.
    const sends = Array.from({ length: 120 }, async () => h.limiter.acquire(0));
    h.verify.schedule(0, 'S-0', h.ledger.get(0)?.notificationRequestId ?? '');
    await h.clock.run(Promise.all([...sends, h.verify.drain()]));
    assert.equal(h.ledger.get(0)?.status, 'ACCEPTED');
  });

  it('passes the stop signal to the status check and records nothing when it is abandoned', async () => {
    const h = harness();
    const controller = new AbortController();
    const signals: (AbortSignal | undefined)[] = [];
    const api = {
      status: async (_id: string, _version: SENDApiVersion, signal?: AbortSignal): Promise<never> => {
        signals.push(signal);
        controller.abort();
        await Promise.resolve();
        throw transportError();
      },
    } as unknown as FakeB2BApi;
    const verify = new VerifyStage({
      api,
      limiter: h.limiter,
      ledger: h.ledger,
      clock: h.clock,
      apiVersion: 'v2.6',
      initialDelayMs: 0,
      timeoutMs: 0,
      onGlobalError: (error) => h.globalErrors.push(error),
      signal: controller.signal,
    });
    verify.schedule(0, 'S-0', 'N');
    await h.clock.run(verify.drain());
    assert.equal(signals[0], controller.signal);
    assert.equal(h.ledger.get(0), undefined, 'no VERIFY_TIMEOUT for a check abandoned by the stop');
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

  it('lowers the rate once per throttling episode, not once per 429 in flight', () => {
    const clock = new VirtualClock();
    const limiter = new GORateLimiter({ ratePerSecond: 20, sleeper: clock, now: () => clock.now() });
    const adapter = new RateAdapter(limiter, 20, clock, true);
    assert.equal(adapter.onThrottled(), 15);
    for (let i = 0; i < 14; i++) assert.equal(adapter.onThrottled(), undefined);
    assert.equal(limiter.ratePerSecond, 15);
    assert.equal(adapter.throttledCount, 15);
    clock.advance(1_000);
    assert.equal(adapter.onThrottled(), 11.25, 'a 429 after the cooldown is a new episode');
  });

  it('never raises the rate above a configured rate below the 1/s floor', () => {
    const clock = new VirtualClock();
    const limiter = new GORateLimiter({ ratePerSecond: 0.5, sleeper: clock, now: () => clock.now() });
    const adapter = new RateAdapter(limiter, 0.5, clock, true);

    assert.equal(adapter.onThrottled(), undefined, 'already at the floor: nothing to lower');
    assert.equal(limiter.ratePerSecond, 0.5);
    clock.advance(30_000);
    assert.equal(adapter.onSuccess(), undefined);
    assert.equal(limiter.ratePerSecond, 0.5);
  });

  it('stops lowering at 1/s when the configured rate is higher', () => {
    const clock = new VirtualClock();
    const limiter = new GORateLimiter({ ratePerSecond: 1.2, sleeper: clock, now: () => clock.now() });
    const adapter = new RateAdapter(limiter, 1.2, clock, true);

    assert.equal(adapter.onThrottled(), 1);
    clock.advance(1_000);
    assert.equal(adapter.onThrottled(), undefined, 'already at 1/s');
    assert.equal(limiter.ratePerSecond, 1);
  });
});

describe('abortableWaits', () => {
  it('returns false on stop but rethrows any other failure', async () => {
    const clock = new VirtualClock();
    const limiter = new GORateLimiter({ ratePerSecond: 1, sleeper: clock, now: () => clock.monotonic() });
    const running = new AbortController();
    await assert.rejects(acquireUnlessStopped(limiter, 7, running.signal), /priority must be an integer/);
    const stopped = new AbortController();
    stopped.abort();
    assert.equal(await acquireUnlessStopped(limiter, 0, stopped.signal), false);

    const failingClock = {
      now: () => 0,
      monotonic: () => 0,
      sleep: async (): Promise<void> => {
        await Promise.resolve();
        throw new Error('timer broken');
      },
    };
    await assert.rejects(sleepUnlessStopped(failingClock, 10, running.signal), /timer broken/);
    assert.equal(await sleepUnlessStopped(clock, 10, stopped.signal), false);
  });
});
