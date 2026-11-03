import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import type { SENDApiVersion } from '../../../services/notification/models/SENDApiVersion.js';
import type { SENDNotificationCreationResponse } from '../../../services/notification/models/SENDNotificationCreationResponse.js';
import type { SENDNotificationRequest } from '../../../services/notification/models/SENDNotificationRequest.js';
import type { SENDPreloadRequest } from '../../../services/attachment/models/SENDPreloadRequest.js';
import type { SENDPreloadResponse } from '../../../services/attachment/models/SENDPreloadResponse.js';
import { FakeB2BApi } from '../../__tests__/helpers/FakeB2BApi.js';
import { readFixture, tempDir, writeFixture } from '../../__tests__/helpers/testFiles.js';
import { VirtualClock } from '../../__tests__/helpers/VirtualClock.js';
import type { SafeStorageGateway } from '../../documents/SafeStorageGateway.js';
import { QA_TEST_PROFILE } from '../../mapping/profiles/qaTestProfile.js';
import { DIRECT_PROFILE } from '../../mapping/profiles/directProfile.js';
import { RequestIdTemplate } from '../../ids/RequestIdTemplate.js';
import type { CanonicalField } from '../../mapping/CanonicalField.js';
import { Journal } from '../../journal/Journal.js';
import { DispatchSession } from '../DispatchSession.js';
import type { DispatchRequestIdOptions } from '../DispatchRequestIdOptions.js';
import { DEFAULT_REQUEST_ID_OPTIONS } from '../../requestId/defaultRequestIdOptions.js';
import type { TimelineSource } from '../../requestId/TimelineSource.js';
import type { SENDTimelineElement } from '../../../services/timeline/models/SENDTimelineElement.js';
import { readRunInfo } from '../runFiles.js';
import type { DispatchSessionOptions } from '../DispatchSessionOptions.js';

const HEADER = 'ID_Scenario,Scenario,Destinatario,Denomination,CAP,Citta,Indirizzo,Stato,RequestID';

class CountingGateway implements SafeStorageGateway {
  public preloads = 0;
  public puts = 0;

  public async preload(requests: ReadonlyArray<SENDPreloadRequest>): Promise<ReadonlyArray<SENDPreloadResponse>> {
    this.preloads += 1;
    await Promise.resolve();
    return requests.map((request) => ({
      preloadIdx: request.preloadIdx,
      key: `PN_NOTIFICATION_ATTACHMENTS-${request.preloadIdx}.pdf`,
      url: 'https://s3.example',
      secret: 's',
      httpMethod: 'PUT',
    }));
  }

  public async upload(): Promise<string> {
    this.puts += 1;
    await Promise.resolve();
    return 'v1';
  }
}

/** Timeline where every notification has its analog PREPARE right away. */
class ImmediateTimelineSource implements TimelineSource {
  public queries = 0;

  public async query(iun: string): Promise<ReadonlyArray<SENDTimelineElement>> {
    await Promise.resolve();
    this.queries += 1;
    return [
      {
        category: 'PREPARE_ANALOG_DOMICILE',
        timelineElementId: `PREPARE_ANALOG_DOMICILE.IUN_${iun}.RECINDEX_0.ATTEMPT_0`,
        timestamp: '2026-11-03T10:05:00.000Z',
      },
    ];
  }
}

function requestIdOptions(source: TimelineSource): DispatchRequestIdOptions {
  return {
    source,
    selection: DEFAULT_REQUEST_ID_OPTIONS,
    initialDelayMs: 60_000,
    timeoutMs: 2 * 3_600_000,
    concurrency: 10,
    isCredentialError: () => false,
  };
}

/** Fake API that stops the session after a number of sends (simulated SIGINT). */
class InterruptingApi extends FakeB2BApi {
  public stopAfter: number | undefined;
  public session: DispatchSession | undefined;

  public override async send(
    request: SENDNotificationRequest,
    apiVersion: SENDApiVersion,
  ): Promise<SENDNotificationCreationResponse> {
    const response = await super.send(request, apiVersion);
    if (this.stopAfter !== undefined && this.created.size >= this.stopAfter) this.session?.stop();
    return response;
  }
}

async function fixture(
  rows: number,
  invalidRows: ReadonlyArray<number> = [],
): Promise<{ dir: string; input: string; pdf: string }> {
  const dir = tempDir('dispatch-session');
  const pdf = path.join(dir, 'atto.pdf');
  await writeFixture(pdf, '%PDF-1.4 atto di test');
  const lines = [HEADER];
  for (let i = 0; i < rows; i++) {
    const zip = invalidRows.includes(i) ? '12' : '00100';
    lines.push(`S-${i},Scenario ${i},RSSMRA80A01H501U,Mario Rossi ${i},${zip},Roma,Via Roma ${i},ITALIA,`);
  }
  const input = path.join(dir, 'input.csv');
  await writeFixture(input, `${lines.join('\n')}\n`);
  // The script gets these directories from GOPaths.createExecutionOutputDir().
  await writeFixture(path.join(dir, 'session-1', '.keep'), '');
  await writeFixture(path.join(dir, 'session-2', '.keep'), '');
  return { dir, input, pdf };
}

function options(
  base: { dir: string; input: string; pdf: string },
  api: FakeB2BApi,
  gateway: SafeStorageGateway,
  clock: VirtualClock,
  overrides: Partial<DispatchSessionOptions> = {},
  session = 'session-1',
): DispatchSessionOptions {
  const runDir = path.join(base.dir, session);
  return {
    runId: '20261103-100000-abcd',
    files: { runInfoPath: path.join(runDir, 'run.json'), journalPath: path.join(runDir, 'journal.jsonl') },
    dryRun: false,
    input: { filePath: base.input, format: 'csv' },
    profile: QA_TEST_PROFILE,
    cliValues: new Map(),
    environmentValues: new Map<CanonicalField, string>([
      ['sender.taxId', '00000000001'],
      ['sender.denomination', 'Comune di Test'],
      ['notificationOptions.group', 'group-1'],
    ]),
    environmentSenderTaxId: '00000000001',
    sharedDocument: { files: [base.pdf], title: 'Atto' },
    documentsDir: base.dir,
    api,
    gateway,
    apiVersion: 'v2.6',
    send: true,
    verify: true,
    tuning: {
      rate: 20,
      burst: 1,
      rateAdaptive: true,
      maxInFlight: 40,
      sendTimeoutMs: 600_000,
      retryAmbiguous: true,
      retryFailed: false,
      retryUncertain: false,
      failFast: false,
      verifyInitialDelayMs: 10_000,
      verifyTimeoutMs: 900_000,
      preloadBatchSize: 15,
      uploadConcurrency: 5,
      uploadReuseMaxAgeMs: 72 * 3_600_000,
    },
    output: {
      format: 'csv',
      outputPath: path.join(runDir, 'output.csv'),
      reportPath: path.join(runDir, 'report.csv'),
      outputColumns: QA_TEST_PROFILE.outputColumns ?? {},
      includeStatus: false,
      onlySuccess: false,
    },
    parameters: { env: 'test' },
    clock,
    ...overrides,
  };
}

const DIRECT_HEADER =
  'id,requestPaId,senderName,receiverName,receiverFiscalCode,receiverAddress,receiverCap,receiverCity,receiverPr,productType,aarKey,aarSha256,attoKey,attoSha256';
const DIRECT_SHA = 'XwRVE/PUU1TEi9r3Pmq2KEkmQ2yr7ge8jUDQKPL0e/Y=';

function directLine(id: string, cap: string): string {
  return `${id},00000000001,Ente,Destinatario,TSTTST80A01H501U,Via Roma 1,${cap},Roma,RM,AR,PN_AAR-1.pdf,${DIRECT_SHA},PN_NOTIFICATION_ATTACHMENTS-1.pdf,${DIRECT_SHA}`;
}

/** Direct-mode session options on `consolidatore.csv` (TC-1, TC-2 valid; TC-3 invalid CAP). */
async function directOptions(
  prefix: string,
  clock: VirtualClock,
  sent: string[],
  template: string,
  overrides: Partial<DispatchSessionOptions> = {},
): Promise<{ dir: string; options: DispatchSessionOptions }> {
  const dir = tempDir(prefix);
  const input = path.join(dir, 'consolidatore.csv');
  await writeFixture(
    input,
    `${DIRECT_HEADER}\n${directLine('TC-1', '00100')}\n${directLine('TC-2', '00100')}\n${directLine('TC-3', '1')}\n`,
  );
  await writeFixture(path.join(dir, 'session-1', '.keep'), '');
  const api = {
    sendPaper: async (request: { readonly requestId: string }): Promise<void> => {
      await Promise.resolve();
      sent.push(request.requestId);
    },
    healthCheck: async (): Promise<void> => Promise.resolve(),
  };
  const base = { dir, input, pdf: path.join(dir, 'unused.pdf') };
  const {
    sharedDocument: _shared,
    api: _api,
    gateway: _gateway,
    ...common
  } = options(base, new FakeB2BApi(clock), new CountingGateway(), clock, {
    profile: DIRECT_PROFILE,
    verify: false,
    environmentValues: new Map(),
  });
  return {
    dir,
    options: {
      ...common,
      output: { ...common.output, outputColumns: DIRECT_PROFILE.outputColumns ?? {} },
      mode: 'direct',
      direct: { api, requestIdTemplate: RequestIdTemplate.parse(template) },
      ...overrides,
    },
  };
}

async function readCsv(file: string): Promise<ReadonlyArray<string>> {
  return ((await readFixture(file)) ?? '').trim().split('\n');
}

async function runSession(session: DispatchSession, clock: VirtualClock): Promise<void> {
  await clock.run(
    session.preflight({ basePath: 'https://api.test.notifichedigitali.it', production: false, groupId: 'group-1' }),
  );
  await clock.run(session.prepareDocuments());
  await clock.run(session.validate());
  await clock.run(session.execute());
  await session.materialize();
  await session.close();
}

describe('DispatchSession', () => {
  it('dry run: no call, no journal, output and report with DRY_RUN status', async () => {
    const base = await fixture(8, [3]);
    const clock = new VirtualClock();
    const api = new FakeB2BApi(clock);
    const gateway = new CountingGateway();
    const session = await DispatchSession.open(options(base, api, gateway, clock, { dryRun: true }));
    assert.equal(
      await session.preflight({ basePath: 'https://api.test.notifichedigitali.it', production: false }),
      undefined,
    );
    await session.prepareDocuments();
    const summary = await session.validate();
    await session.materialize();
    await session.close();

    assert.equal(api.calls.length, 0);
    assert.equal(gateway.preloads, 0);
    assert.equal(summary.validRows, 7);
    assert.equal(summary.invalidRows, 1);
    const report = await readCsv(path.join(base.dir, 'session-1', 'report.csv'));
    assert.match(report[1] ?? '', /^0,S-0,DRY_RUN/);
    assert.match(report[4] ?? '', /^3,S-3,INVALID/);
    assert.equal(await readFixture(path.join(base.dir, 'session-1', 'journal.jsonl')), undefined);
    assert.equal(await readFixture(path.join(base.dir, 'session-1', 'run.json')), undefined);
  });

  it('sends every valid row once, uploads the shared document once, writes output 1:1', async () => {
    const base = await fixture(50, [7]);
    const clock = new VirtualClock();
    const api = new FakeB2BApi(clock);
    const gateway = new CountingGateway();
    const session = await DispatchSession.open(options(base, api, gateway, clock));
    await runSession(session, clock);

    assert.equal(api.created.size, 49);
    assert.equal(gateway.preloads, 1);
    assert.equal(gateway.puts, 1);
    assert.equal(api.count('groups'), 1);
    // Call spacing is asserted in SendStage.test.ts: here the journal does real
    // I/O, which the virtual clock cannot freeze, so call timestamps are skewed.
    const output = await readCsv(path.join(base.dir, 'session-1', 'output.csv'));
    assert.equal(output.length, 51, 'header + one line per input row');
    assert.equal(output[0], `${HEADER},iun`, 'original columns first, RequestID filled in place, then iun');
    assert.match(output[1] ?? '', /^S-0,.*[A-Z]{4}-[A-Z]{4}-[A-Z]{4}-\d{6}-[A-Z]-\d$/);
    assert.match(output[8] ?? '', /^S-7,.*,$/, 'invalid row kept, empty iun');
    const progress = session.progress();
    assert.equal(progress.byStatus.get('ACCEPTED'), 49);
    assert.equal(progress.byStatus.get('INVALID'), 1);
  });

  it('resumes after a stop without sending any row twice', async () => {
    const base = await fixture(40);
    const clock = new VirtualClock();
    const api = new InterruptingApi(clock);
    api.stopAfter = 15;
    const gateway = new CountingGateway();
    const first = await DispatchSession.open(options(base, api, gateway, clock));
    api.session = first;
    await runSession(first, clock);
    assert.ok(first.stopped);
    const sentBefore = api.created.size;
    assert.ok(sentBefore >= 15 && sentBefore < 40, `sent before stop: ${sentBefore}`);

    api.stopAfter = undefined;
    const previousRunInfoPath = path.join(base.dir, 'session-1', 'run.json');
    const previousRun = await readRunInfo(previousRunInfoPath);
    const resumed = await DispatchSession.open(
      options(base, api, gateway, clock, { previousRun, previousRunInfoPath }, 'session-2'),
    );
    await runSession(resumed, clock);
    assert.equal(api.created.size, 40, 'every row sent exactly once');
    assert.equal(gateway.puts, 1, 'shared document reused from the journal');

    const info = await readRunInfo(path.join(base.dir, 'session-2', 'run.json'));
    assert.equal(info.runId, previousRun.runId);
    assert.equal(info.resumedFrom, previousRunInfoPath);
    assert.deepEqual(info.journalFiles, [
      path.join(base.dir, 'session-1', 'journal.jsonl'),
      path.join(base.dir, 'session-2', 'journal.jsonl'),
    ]);
    const journal = await Journal.read(info.journalFiles);
    assert.equal(journal.filter((entry) => entry.event === 'SENT').length, 40);
    assert.equal(resumed.progress().byStatus.get('ACCEPTED'), 40);
  });

  it('a resume never turns a row already sent into INVALID', async () => {
    const base = await fixture(5);
    const clock = new VirtualClock();
    const api = new FakeB2BApi(clock);
    const gateway = new CountingGateway();
    await runSession(await DispatchSession.open(options(base, api, gateway, clock)), clock);
    assert.equal(api.created.size, 5);

    // The resume maps the rows differently (no sender any more): every row is
    // now invalid, but all of them were already accepted by SEND.
    const previousRunInfoPath = path.join(base.dir, 'session-1', 'run.json');
    const previousRun = await readRunInfo(previousRunInfoPath);
    const resumed = await DispatchSession.open(
      options(
        base,
        api,
        gateway,
        clock,
        { previousRun, previousRunInfoPath, environmentValues: new Map(), verify: false },
        'session-2',
      ),
    );
    const summary = await clock.run(resumed.validate());
    assert.equal(summary.invalidRows, 0);
    assert.equal(summary.validRows, 5);
    await clock.run(resumed.execute());
    await resumed.materialize();
    await resumed.close();
    assert.equal(api.created.size, 5, 'nothing sent again');
    assert.equal(resumed.progress().byStatus.get('ACCEPTED'), 5);
    assert.equal(resumed.progress().byStatus.get('INVALID'), undefined);
    const journal = await Journal.read([path.join(base.dir, 'session-2', 'journal.jsonl')]);
    assert.equal(journal.filter((entry) => entry.event === 'ROW_INVALID').length, 0);
  });

  it('refuses to send row files without a SafeStorage gateway instead of sending placeholder keys', async () => {
    const base = await fixture(2);
    const clock = new VirtualClock();
    const api = new FakeB2BApi(clock);
    const { gateway: _gateway, ...withoutGateway } = options(base, api, new CountingGateway(), clock);
    const session = await DispatchSession.open(withoutGateway);
    await assert.rejects(clock.run(session.prepareDocuments()), /SafeStorage gateway is not configured/);
    await session.close();
    assert.equal(api.created.size, 0);
  });

  it('refuses a resume when the input changed', async () => {
    const base = await fixture(3);
    const clock = new VirtualClock();
    const api = new FakeB2BApi(clock);
    const session = await DispatchSession.open(options(base, api, new CountingGateway(), clock));
    await session.close();
    const content = (await readFixture(base.input)) ?? '';
    await writeFixture(base.input, `${content}S-9,x,RSSMRA80A01H501U,y,00100,Roma,Via,ITALIA,\n`);
    const previousRunInfoPath = path.join(base.dir, 'session-1', 'run.json');
    const previousRun = await readRunInfo(previousRunInfoPath);
    await assert.rejects(
      DispatchSession.open(
        options(base, api, new CountingGateway(), clock, { previousRun, previousRunInfoPath }, 'session-2'),
      ),
      /input file changed/,
    );
  });

  it('send → verify → request-id: fills the requestId column', async () => {
    const base = await fixture(5);
    const clock = new VirtualClock();
    const api = new FakeB2BApi(clock);
    const source = new ImmediateTimelineSource();
    const session = await DispatchSession.open(
      options(base, api, new CountingGateway(), clock, { requestId: requestIdOptions(source) }),
    );
    await runSession(session, clock);

    assert.equal(session.progress().byStatus.get('REQUEST_ID_FOUND'), 5);
    const output = await readCsv(path.join(base.dir, 'session-1', 'output.csv'));
    // QA profile: requestId goes into the existing RequestID column.
    assert.match(output[1] ?? '', /,PREPARE_ANALOG_DOMICILE\.IUN_[A-Z-0-9]+\.RECINDEX_0\.ATTEMPT_0,[A-Z]{4}-/);
    const report = await readCsv(path.join(base.dir, 'session-1', 'report.csv'));
    assert.match(report[0] ?? '', /analogRequestId,digitalRequestId,requestIds,requestIdReason/);
    assert.match(report[1] ?? '', /REQUEST_ID_FOUND/);
  });

  it('phases without send: retrieves requestIds for the IUNs of the input (RF-12)', async () => {
    const dir = tempDir('dispatch-preset');
    const input = path.join(dir, 'sent.csv');
    const iuns = ['PAYK-MWDR-ZUAZ-202601-K-1', 'TQJZ-VKMH-QDYX-202601-Q-1'];
    await writeFixture(input, `ID_Scenario,iun\nS-1,${iuns[0]}\nS-2,${iuns[1]}\nS-3,not-an-iun\n`);
    await writeFixture(path.join(dir, 'session-1', '.keep'), '');
    const clock = new VirtualClock();
    const api = new FakeB2BApi(clock);
    const source = new ImmediateTimelineSource();
    const base = { dir, input, pdf: path.join(dir, 'unused.pdf') };
    const { sharedDocument: _shared, ...noDocuments } = options(base, api, new CountingGateway(), clock, {
      send: false,
      verify: false,
      requestId: requestIdOptions(source),
      profile: { ...QA_TEST_PROFILE, columns: { ...QA_TEST_PROFILE.columns, iun: 'preset.iun' } },
    });
    const session = await DispatchSession.open(noDocuments);
    const summary = await clock.run(session.validate());
    assert.equal(summary.validRows, 2);
    assert.equal(summary.invalidRows, 1);
    await clock.run(session.execute());
    await session.materialize();
    await session.close();

    assert.equal(api.calls.length, 0, 'no B2B call without send and verify');
    assert.equal(source.queries, 2);
    const report = await readCsv(path.join(dir, 'session-1', 'report.csv'));
    assert.match(report[1] ?? '', new RegExp(`^0,S-1,REQUEST_ID_FOUND,.*IUN_${iuns[0]}`));
    assert.match(report[3] ?? '', /^2,S-3,INVALID/);
  });

  it('direct mode: PUTs to pn-ec with template requestIds and fills the requestId column', async () => {
    const clock = new VirtualClock();
    const sent: string[] = [];
    const { dir, options: direct } = await directOptions(
      'dispatch-direct',
      clock,
      sent,
      'PNMAN.GO-{runId}.{rowKey}.PCRETRY_0',
    );
    const session = await DispatchSession.open(direct);
    await session.checkExternalChannels();
    const summary = await clock.run(session.validate());
    assert.equal(summary.validRows, 2);
    assert.deepEqual(summary.duplicateRequestIds, []);
    await clock.run(session.execute());
    await session.materialize();
    await session.close();

    assert.deepEqual(sent, [
      'PNMAN.GO-20261103-100000-abcd.TC-1.PCRETRY_0',
      'PNMAN.GO-20261103-100000-abcd.TC-2.PCRETRY_0',
    ]);
    const lines = await readCsv(path.join(dir, 'session-1', 'output.csv'));
    assert.match(lines[0] ?? '', /,requestId$/);
    assert.match(lines[1] ?? '', /,PNMAN\.GO-20261103-100000-abcd\.TC-1\.PCRETRY_0$/);
    assert.match(lines[3] ?? '', /^TC-3,.*,$/, 'invalid row kept with empty requestId');
  });

  it('direct mode: the success-only output keeps the rows pn-ec accepted (no IUN)', async () => {
    const clock = new VirtualClock();
    const sent: string[] = [];
    const { dir, options: direct } = await directOptions(
      'dispatch-direct-success',
      clock,
      sent,
      'PNMAN.GO-{runId}.{rowKey}.PCRETRY_0',
    );
    const session = await DispatchSession.open({ ...direct, output: { ...direct.output, onlySuccess: true } });
    await clock.run(session.validate());
    await clock.run(session.execute());
    await session.materialize();
    await session.close();

    const lines = await readCsv(path.join(dir, 'session-1', 'output.csv'));
    assert.equal(lines.length, 3, 'header + the 2 sent rows');
    assert.match(lines[1] ?? '', /^TC-1,/);
    assert.match(lines[2] ?? '', /^TC-2,/);
  });

  it('direct mode: requestIds shared by several rows, or rendered from an empty column, are caught before sending', async () => {
    const clock = new VirtualClock();
    const shared = await directOptions(
      'dispatch-direct-dup',
      clock,
      [],
      'PNMAN.GO-{runId}.{col:receiverPr}.PCRETRY_0',
      {
        dryRun: true,
      },
    );
    const duplicated = await clock.run((await DispatchSession.open(shared.options)).validate());
    assert.deepEqual(duplicated.duplicateRequestIds, ['PNMAN.GO-20261103-100000-abcd.RM.PCRETRY_0']);

    const empty = await directOptions('dispatch-direct-empty', clock, [], 'PNMAN.GO-{runId}.{col:pratica}.PCRETRY_0', {
      dryRun: true,
    });
    const session = await DispatchSession.open(empty.options);
    const summary = await clock.run(session.validate());
    assert.equal(summary.validRows, 0);
    assert.equal(summary.invalidRows, 3);
    await session.materialize();
    const report = await readCsv(path.join(empty.dir, 'session-1', 'report.csv'));
    assert.match(report[1] ?? '', /requestId template: column "+pratica"+ is empty/);
  });
});
