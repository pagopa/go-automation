import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOLogger } from '@pagopa/go-common/logging';

import { TransitionLogger } from '../TransitionLogger.js';
import { FakeLogger } from './helpers/testScript.js';

describe('TransitionLogger', () => {
  it('logs errors always and the other transitions only with --verbose', () => {
    const quiet = new FakeLogger();
    const verbose = new FakeLogger();
    const failed = {
      ts: 't',
      event: 'SEND_FAILED' as const,
      rowKey: 'S-1',
      error: { code: 'PN_X', message: 'bad', details: '[{"code":"PN_X"}]' },
    };
    const sent = { ts: 't', event: 'SENT' as const, rowKey: 'S-2', iun: 'IUN', attempt: 1 };

    for (const target of [quiet, verbose]) {
      const logger = new TransitionLogger(target as unknown as GOLogger, target === verbose);
      logger.handle(failed);
      logger.handle(sent);
      logger.handle({ ts: 't', event: 'DOCUMENT_UPLOADED' });
    }

    assert.deepEqual(quiet.of('warning'), ['[S-1] SEND_FAILED PN_X: bad [PN_X] (dettagli nel report)']);
    assert.deepEqual(quiet.of('info'), []);
    assert.deepEqual(verbose.of('info'), ['[S-2] SENT #1 iun=IUN'], 'run-level entries are not logged');
  });

  it('always logs invalid rows with codes and fields only, never the row values', () => {
    const quiet = new FakeLogger();
    const logger = new TransitionLogger(quiet as unknown as GOLogger, false);
    const issues = [
      { code: 'INVALID_FORMAT', field: 'recipient.taxId', message: 'recipient.taxId "RSSMRA80" must be a tax id' },
      { code: 'MISSING_FIELD', field: 'subject', message: 'subject is required' },
    ];
    logger.handle({
      ts: 't',
      event: 'ROW_INVALID',
      rowKey: 'S-3',
      error: {
        code: 'INVALID_FORMAT',
        message: issues.map((i) => i.message).join('; '),
        details: JSON.stringify(issues),
      },
    });
    logger.handle({
      ts: 't',
      event: 'ROW_INVALID',
      rowKey: 'S-4',
      error: { code: 'INVALID', message: 'x', details: '{' },
    });

    assert.deepEqual(quiet.of('warning'), [
      '[S-3] ROW_INVALID INVALID_FORMAT(recipient.taxId), MISSING_FIELD(subject) (dettagli nel report)',
      '[S-4] ROW_INVALID INVALID (dettagli nel report)',
    ]);
  });
  it('logs only the codes of the errors returned by SEND, never their detail', () => {
    const quiet = new FakeLogger();
    const logger = new TransitionLogger(quiet as unknown as GOLogger, false);
    const sendErrors = [
      { code: 'PN_INVALID_TAXID', element: 'recipients[0].taxId', detail: 'taxId RSSMRA80A01H501U not valid' },
    ];
    logger.handle({
      ts: 't',
      event: 'REFUSED',
      rowKey: 'S-5',
      error: { code: 'REFUSED', message: 'notification refused by SEND', details: JSON.stringify(sendErrors) },
    });

    const [line] = quiet.of('warning');
    assert.equal(
      line,
      '[S-5] REFUSED REFUSED: notification refused by SEND [PN_INVALID_TAXID(recipients[0].taxId)] (dettagli nel report)',
    );
    assert.doesNotMatch(line ?? '', /RSSMRA80A01H501U/);
  });
});
