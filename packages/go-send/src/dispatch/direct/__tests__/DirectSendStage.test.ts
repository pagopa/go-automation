import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { GORateLimiter } from '@pagopa/go-common/concurrency';
import type { GOHttpClientError } from '@pagopa/go-common/http';

import { httpError, transportError } from '../../__tests__/helpers/FakeB2BApi.js';
import { MemorySink } from '../../__tests__/helpers/MemorySink.js';
import { VirtualClock } from '../../__tests__/helpers/VirtualClock.js';
import type { DispatchError } from '../../DispatchError.js';
import { DocumentResolver } from '../../documents/DocumentResolver.js';
import { LocalDocumentInspector } from '../../documents/LocalDocumentInspector.js';
import { RequestIdTemplate } from '../../ids/RequestIdTemplate.js';
import { UploadError } from '../../documents/UploadError.js';
import { RowLedger } from '../../journal/RowLedger.js';
import { RateAdapter } from '../../stages/RateAdapter.js';
import { buildDirectRecord } from '../../mapping/buildDirectRecord.js';
import type { CanonicalField } from '../../mapping/CanonicalField.js';
import { mapRow } from '../../mapping/mapRow.js';
import { DIRECT_PROFILE } from '../../mapping/profiles/directProfile.js';
import type { DispatchRecord } from '../../model/DispatchRecord.js';
import { buildPaperEngagement } from '../buildPaperEngagement.js';
import { DirectSendStage } from '../DirectSendStage.js';
import type { ExternalChannelsApi } from '../ExternalChannelsApi.js';
import { ExternalChannelsChannel } from '../ExternalChannelsChannel.js';
import type { PaperEngagementRequest } from '../PaperEngagementRequest.js';

const SHA = 'XwRVE/PUU1TEi9r3Pmq2KEkmQ2yr7ge8jUDQKPL0e/Y=';

/** A row in the format of the `direct` profile (pn-ec field names). */
const ROW: Readonly<Record<string, string>> = {
  id: 'TC-1',
  requestPaId: '00000000001',
  senderName: 'Ente di test',
  senderAddress: 'Via Roma 1',
  senderCity: 'Roma',
  senderPr: 'RM',
  receiverName: 'Destinatario di test',
  receiverFiscalCode: 'TSTTST80A01H501U',
  receiverAddress: 'Via Milano 2',
  receiverCap: '20100',
  receiverCity: 'Milano',
  receiverPr: 'MI',
  receiverCountry: 'ITALIA',
  productType: 'rs',
  aarKey: 'PN_AAR-1.pdf',
  aarSha256: SHA,
  attoKey: 'safestorage://PN_NOTIFICATION_ATTACHMENTS-1.pdf',
  attoSha256: SHA,
  arName: 'Ente di test',
  arAddress: 'Via Roma 1',
  arCap: '00100',
  arCity: 'Roma',
};

const CONTEXT = { mode: 'direct' as const, documentsDir: '/docs', sharedDocumentAvailable: false };

function record(overrides: Readonly<Record<string, string>> = {}): DispatchRecord {
  const result = buildDirectRecord(
    0,
    'TC-1',
    mapRow({ ...ROW, ...overrides }, DIRECT_PROFILE),
    CONTEXT,
    'PNMAN.GO-run.TC-1.PCRETRY_0',
  );
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.record;
}

describe('buildDirectRecord', () => {
  it('accepts any consolidator product and defaults the print type', () => {
    const direct = record();
    assert.equal(direct.product, 'RS');
    assert.equal(direct.direct?.printType, 'BN_FRONTE_RETRO');
    assert.equal(direct.physicalAddress.foreignState, undefined);
    assert.deepEqual(direct.documents, {
      kind: 'reference',
      refs: [
        { key: ROW['attoKey'], versionToken: '', sha256: SHA, contentType: 'application/pdf', title: 'Documento' },
      ],
    });
  });

  it('requires AAR, province for Italy, and documents already in SafeStorage', () => {
    const values = new Map<CanonicalField, string>(mapRow(ROW, DIRECT_PROFILE));
    values.delete('direct.aar.key');
    values.delete('physicalAddress.province');
    values.delete('documents.reference.key');
    values.delete('documents.reference.sha256');
    values.set('documents.files', 'atto.pdf');
    const result = buildDirectRecord(0, 'TC-1', values, CONTEXT, 'R');
    assert.ok(!result.ok);
    assert.deepEqual(result.issues.map((issue) => issue.code).sort(), [
      'MISSING_FIELD',
      'MISSING_FIELD',
      'UNSUPPORTED_IN_DIRECT',
    ]);
  });

  it('accepts a foreign address without province', () => {
    const foreign = record({ receiverCountry: 'FRANCIA', receiverPr: '', receiverCap: '75001' });
    assert.equal(foreign.physicalAddress.foreignState, 'FRANCIA');
  });
});

describe('RequestIdTemplate', () => {
  it('renders the placeholders and rejects unknown ones', () => {
    const template = RequestIdTemplate.parse('PNMAN.GO-{runId}.{rowKey}.R{rowIndex}.{col:caso}.PCRETRY_{attempt}');
    assert.equal(template.render('run', 'TC-1', 3, { caso: ' A ' }), 'PNMAN.GO-run.TC-1.R3.A.PCRETRY_0');
    assert.throws(() => RequestIdTemplate.parse('X-{iun}'), /unknown placeholder \{iun\}/);
    assert.throws(() => RequestIdTemplate.parse('X-{col:}'), /unknown placeholder/);
    assert.deepEqual(template.emptyColumns({ caso: ' A ' }), []);
    assert.deepEqual(template.emptyColumns({ caso: '  ' }), ['caso']);
    assert.deepEqual(RequestIdTemplate.parse('X-{col:a}-{col:b}').emptyColumns({ b: 'v' }), ['a']);
  });
});

describe('buildPaperEngagement', () => {
  it('produces the pn-ec request with AAR first and safestorage URIs', () => {
    const request = buildPaperEngagement(record(), [{ key: 'PN_NOTIFICATION_ATTACHMENTS-1.pdf', sha256: SHA }], 'T');
    assert.deepEqual(request.attachments, [
      { uri: 'safestorage://PN_AAR-1.pdf', order: 0, documentType: 'AAR', sha256: SHA },
      { uri: 'safestorage://PN_NOTIFICATION_ATTACHMENTS-1.pdf', order: 1, documentType: 'ATTO', sha256: SHA },
    ]);
    assert.equal(request.requestId, 'PNMAN.GO-run.TC-1.PCRETRY_0');
    assert.equal(request.iun, null);
    assert.equal(request.productType, 'RS');
    assert.equal(request.receiverCountry, 'ITALIA');
    assert.equal(request.receiverNameRow2, null);
    assert.equal(request.arCap, '00100');
    assert.equal(request.vas, null);
    assert.equal(request.clientRequestTimeStamp, 'T');
  });
});

/** A request seen by the local pn-ec double. */
interface ReceivedRequest {
  readonly method: string;
  readonly url: string;
  readonly clientId: string;
  readonly body: string;
}

/** In-memory pn-ec: scripted failures, then success. */
class FakeExternalChannels implements ExternalChannelsApi {
  public readonly requests: PaperEngagementRequest[] = [];
  public readonly script: GOHttpClientError[] = [];

  public async sendPaper(request: PaperEngagementRequest): Promise<void> {
    await Promise.resolve();
    this.requests.push(request);
    const failure = this.script.shift();
    if (failure !== undefined) throw failure;
  }

  public async healthCheck(): Promise<void> {
    await Promise.resolve();
  }
}

interface DirectHarness {
  readonly clock: VirtualClock;
  readonly ledger: RowLedger;
  readonly sink: MemorySink;
  readonly errors: DispatchError[];
  readonly limiter: GORateLimiter;
  readonly controller: AbortController;
  readonly stage: DirectSendStage;
}

function stage(
  api: FakeExternalChannels,
  resolver: DocumentResolver = new DocumentResolver({
    inspector: new LocalDocumentInspector(os.tmpdir()),
    placeholders: false,
  }),
): DirectHarness {
  const clock = new VirtualClock();
  const sink = new MemorySink();
  const ledger = new RowLedger(sink, () => new Date(clock.now()));
  const errors: DispatchError[] = [];
  const controller = new AbortController();
  const limiter = new GORateLimiter({ ratePerSecond: 5, sleeper: clock, now: () => clock.monotonic() });
  return {
    clock,
    ledger,
    sink,
    errors,
    limiter,
    controller,
    stage: new DirectSendStage({
      api,
      limiter,
      rateAdapter: new RateAdapter(limiter, 5, clock, true),
      ledger,
      clock,
      resolver,
      onGlobalError: (error) => {
        errors.push(error);
        controller.abort();
      },
      signal: controller.signal,
    }),
  };
}

describe('DirectSendStage', () => {
  it('sends and records the requestId', async () => {
    const api = new FakeExternalChannels();
    const h = stage(api);
    await h.clock.run(h.stage.send(record()));
    assert.equal(h.ledger.get(0)?.status, 'SENT');
    assert.equal(h.ledger.get(0)?.requestId, 'PNMAN.GO-run.TC-1.PCRETRY_0');
    assert.equal(api.requests.length, 1);
  });

  it('retries 5xx and transport errors with the same request', async () => {
    const api = new FakeExternalChannels();
    api.script.push(httpError(503), transportError());
    const h = stage(api);
    await h.clock.run(h.stage.send(record()));
    assert.equal(h.ledger.get(0)?.status, 'SENT');
    assert.equal(api.requests.length, 3);
    assert.equal(new Set(api.requests.map((request) => request.requestId)).size, 1);
  });

  it('turns 409 into SENT with a warning, 400 into SEND_FAILED, 401 into a global error', async () => {
    const duplicate = new FakeExternalChannels();
    duplicate.script.push(httpError(409));
    const h1 = stage(duplicate);
    await h1.clock.run(h1.stage.send(record()));
    assert.equal(h1.ledger.get(0)?.status, 'SENT');
    assert.deepEqual(h1.ledger.get(0)?.warnings, ['DUPLICATE_REQUEST_ID']);

    const bad = new FakeExternalChannels();
    bad.script.push(httpError(400, { errors: ['receiverCap'] }));
    const h2 = stage(bad);
    await h2.clock.run(h2.stage.send(record()));
    assert.equal(h2.ledger.get(0)?.status, 'SEND_FAILED');
    assert.equal(h2.ledger.get(0)?.error?.code, 'HTTP_400');
    assert.equal(h2.ledger.get(0)?.error?.retryable, false);

    const forbidden = new FakeExternalChannels();
    forbidden.script.push(httpError(401));
    const h3 = stage(forbidden);
    await h3.clock.run(h3.stage.send(record()));
    assert.equal(h3.errors[0]?.code, 'HTTP_401');
  });
});

describe('DirectSendStage (resume, throttling, documents)', () => {
  it('numbers attempts after those of previous sessions, with maxAttempts per session', async () => {
    const api = new FakeExternalChannels();
    api.script.push(httpError(503), httpError(503), httpError(503));
    const h = stage(api);
    const previous = {
      rowIndex: 0,
      rowKey: 'TC-1',
      status: 'SEND_FAILED' as const,
      sendAttempts: 3,
      verifyChecks: 0,
      requestIdChecks: 0,
      warnings: [],
    };
    await h.clock.run(h.stage.send(record(), previous));
    assert.deepEqual(
      h.sink.events('SENDING').map((entry) => entry.attempt),
      [4, 5, 6],
    );
    assert.equal(h.ledger.get(0)?.sendAttempts, 6);
    assert.equal(h.ledger.get(0)?.status, 'SEND_FAILED');
  });

  it('lowers the shared limiter rate on 429', async () => {
    const api = new FakeExternalChannels();
    api.script.push(httpError(429));
    const h = stage(api);
    await h.clock.run(h.stage.send(record()));
    assert.equal(h.ledger.get(0)?.status, 'SENT');
    assert.ok(h.limiter.ratePerSecond < 5, `rate ${h.limiter.ratePerSecond}`);
  });

  it('maps document failures like the e2e stage and stops the run on run-level ones', async () => {
    const rejecting = {
      resolve: async (): Promise<never> => {
        await Promise.resolve();
        throw new UploadError('UPLOAD_REJECTED', 'preload failed', { cause: httpError(403) });
      },
    } as unknown as DocumentResolver;
    const api = new FakeExternalChannels();
    const h = stage(api, rejecting);
    await h.clock.run(h.stage.send(record()));
    assert.equal(h.ledger.get(0)?.error?.code, 'UPLOAD_REJECTED');
    assert.equal(h.errors[0]?.code, 'HTTP_403');
    assert.equal(api.requests.length, 0);
  });
});

describe('ExternalChannelsChannel', () => {
  it('PUTs the request with the client id header and checks the tunnel', async () => {
    const received: ReceivedRequest[] = [];
    const server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8');
      });
      request.on('end', () => {
        received.push({
          method: request.method ?? '',
          url: request.url ?? '',
          clientId: String(request.headers['x-pagopa-extch-cx-id']),
          body,
        });
        response.statusCode = request.method === 'GET' ? 404 : 204;
        response.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const channel = new ExternalChannelsChannel(`http://127.0.0.1:${port}/`, 'pn-cons-000', 5_000);
      await channel.healthCheck();
      await channel.sendPaper(buildPaperEngagement(record(), [{ key: 'K', sha256: SHA }], 'T'));
      assert.equal(received[1]?.method, 'PUT');
      assert.equal(
        received[1]?.url,
        `/external-channels/v1/paper-deliveries-engagements/${encodeURIComponent('PNMAN.GO-run.TC-1.PCRETRY_0')}`,
      );
      assert.equal(received[1]?.clientId, 'pn-cons-000');
      assert.equal((JSON.parse(received[1]?.body ?? '{}') as PaperEngagementRequest).receiverCity, 'Milano');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await assert.rejects(new ExternalChannelsChannel('http://127.0.0.1:9', 'x', 2_000).healthCheck());
  });
});
