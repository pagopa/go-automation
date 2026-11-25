import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { InputRow } from '../../input/InputRow.js';
import { RequestIdTemplate } from '../../ids/RequestIdTemplate.js';
import type { CanonicalField } from '../CanonicalField.js';
import type { MappingProfile } from '../MappingProfile.js';
import { DIRECT_PROFILE } from '../profiles/directProfile.js';
import { QA_TEST_PROFILE } from '../profiles/qaTestProfile.js';
import { RecordFactory } from '../RecordFactory.js';
import type { RecordBuildContext } from '../RecordBuildContext.js';
import type { RecordBuildResult } from '../RecordBuildResult.js';

const SHA = 'XwRVE/PUU1TEi9r3Pmq2KEkmQ2yr7ge8jUDQKPL0e/Y=';
const E2E_CONTEXT: RecordBuildContext = { documentsDir: '/docs', sharedDocumentAvailable: true };
const DIRECT_CONTEXT: RecordBuildContext = { mode: 'direct', documentsDir: '/docs', sharedDocumentAvailable: false };

const QA_ROW: Readonly<Record<string, string>> = {
  ID_Scenario: 'S-01',
  Scenario: 'Test AR',
  Destinatario: 'RSSMRA80A01H501U',
  Denomination: 'Mario Rossi',
  CAP: '00100',
  Citta: 'Roma',
  Indirizzo: 'Via Roma 1',
  Sender: 'Comune di Test',
  'Tax ID': '00000000001',
};

const DIRECT_ROW: Readonly<Record<string, string>> = {
  id: 'TC-1',
  caso: 'A',
  requestPaId: '00000000001',
  senderName: 'Ente',
  receiverName: 'Destinatario',
  receiverFiscalCode: 'TSTTST80A01H501U',
  receiverAddress: 'Via Milano 2',
  receiverCap: '20100',
  receiverCity: 'Milano',
  receiverPr: 'MI',
  productType: 'ar',
  aarKey: 'PN_AAR-1.pdf',
  aarSha256: SHA,
  attoKey: 'PN_NOTIFICATION_ATTACHMENTS-1.pdf',
  attoSha256: SHA,
};

function inputRow(values: Readonly<Record<string, string>>, rowIndex = 0): InputRow {
  return { rowIndex, values, original: values };
}

function layer(entries: ReadonlyArray<readonly [CanonicalField, string]>): ReadonlyMap<CanonicalField, string> {
  return new Map(entries);
}

describe('RecordFactory: precedence', () => {
  const profile: MappingProfile = {
    ...QA_TEST_PROFILE,
    transforms: {
      ...QA_TEST_PROFILE.transforms,
      'notificationOptions.taxonomyCode': [{ op: 'default', value: '010101A' }],
      abstract: [{ op: 'default', value: 'profile' }],
      'notificationOptions.paProtocolNumber': [
        { op: 'constantIfPresent', field: 'notificationOptions.group', value: 'P' },
      ],
    },
  };

  function create(
    cliValues: ReadonlyMap<CanonicalField, string>,
    environmentValues: ReadonlyMap<CanonicalField, string>,
  ): RecordBuildResult {
    return new RecordFactory({ profile, cliValues, environmentValues, context: E2E_CONTEXT }).create(inputRow(QA_ROW))
      .result;
  }

  it('profile defaults beat neutral defaults', () => {
    const result = create(new Map(), new Map());
    assert.ok(result.ok);
    assert.equal(result.record.options.taxonomyCode, '010101A');
    assert.equal(result.record.abstract, 'profile');
    assert.equal(result.record.options.paProtocolNumber, undefined, 'no group, no trigger');
  });

  it('CLI and environment beat profile defaults', () => {
    const env = create(new Map(), layer([['abstract', 'env']]));
    assert.ok(env.ok);
    assert.equal(env.record.abstract, 'env');
    const cli = create(layer([['notificationOptions.taxonomyCode', '020202N']]), layer([['abstract', 'env']]));
    assert.ok(cli.ok);
    assert.equal(cli.record.options.taxonomyCode, '020202N');
    assert.equal(cli.record.abstract, 'env');
  });

  it('constantIfPresent sees triggers coming from CLI or environment', () => {
    const result = create(new Map(), layer([['notificationOptions.group', 'g1']]));
    assert.ok(result.ok);
    assert.equal(result.record.options.paProtocolNumber, 'P');
  });

  it('the row beats CLI and environment', () => {
    const result = create(layer([['subject', 'cli']]), layer([['subject', 'env']]));
    assert.ok(result.ok);
    assert.equal(result.record.subject, 'Test AR');
  });
});

describe('RecordFactory: direct mode', () => {
  function factory(template: string): RecordFactory {
    return new RecordFactory({
      profile: DIRECT_PROFILE,
      cliValues: new Map(),
      environmentValues: new Map(),
      context: DIRECT_CONTEXT,
      direct: { runId: 'run', template: RequestIdTemplate.parse(template) },
    });
  }

  it('requires the direct options', () => {
    assert.throws(
      () =>
        new RecordFactory({
          profile: DIRECT_PROFILE,
          cliValues: new Map(),
          environmentValues: new Map(),
          context: DIRECT_CONTEXT,
        }),
      /direct mode requires the requestId options/,
    );
  });

  it('builds the direct record with the rendered requestId', () => {
    const created = factory('PNMAN.GO-{runId}.{rowKey}.{col:caso}.PCRETRY_0').create(inputRow(DIRECT_ROW, 4));
    assert.equal(created.rowKey, 'TC-1');
    assert.ok(created.result.ok);
    assert.equal(created.result.record.direct?.requestId, 'PNMAN.GO-run.TC-1.A.PCRETRY_0');
    assert.equal(created.result.record.product, 'AR');
  });

  it('adds an issue for every empty template column, also to an invalid row', () => {
    const template = 'PNMAN.GO-{runId}.{col:caso}.{col:lotto}';
    const empty = factory(template).create(inputRow({ ...DIRECT_ROW, caso: ' ' }));
    assert.ok(!empty.result.ok);
    assert.deepEqual(
      empty.result.issues.map((issue) => issue.message),
      ['requestId template: column "caso" is empty', 'requestId template: column "lotto" is empty'],
    );

    const invalid = factory(template).create(
      inputRow({ ...DIRECT_ROW, receiverFiscalCode: 'X', caso: '', lotto: '1' }),
    );
    assert.ok(!invalid.result.ok);
    assert.deepEqual(
      invalid.result.issues.map((issue) => issue.code),
      ['INVALID_FORMAT', 'MISSING_FIELD'],
    );
  });
});
