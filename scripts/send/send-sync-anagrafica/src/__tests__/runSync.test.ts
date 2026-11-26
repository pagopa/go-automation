/**
 * Test del cancello che sta davanti alle scritture.
 *
 * La conferma viene chiesta **anche** sotto `--dry-run`, con un testo diverso:
 * se il dry run saltasse la domanda diventerebbe il modo per aggirarla, e un
 * prompt che chiede "scrivo?" e poi non scrive insegna a non leggere i prompt.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { hasFailedWrites, runSync } from '../libs/runSync.js';
import { main } from '../main.js';
import type { TableSyncPlan } from '../libs/planSync.js';

import { TABLES_PATH, fakeScript, makeConfig, s } from './fixtures.js';

/** Un piano con una scrittura sola. */
function plan(overrides: Partial<TableSyncPlan> = {}): TableSyncPlan {
  return {
    table: 'pn-EcAnagrafica',
    account: 'confinfo',
    profile: 'send-confinfo-test',
    keys: ['cxId'],
    syncMode: 'replace',
    writes: [
      { key: 'pn-test', item: { cxId: s('pn-test') }, reason: 'overwrite', live: undefined, droppedAttributes: [] },
    ],
    untouched: 0,
    ...overrides,
  };
}

describe('runSync with nothing to write', () => {
  it('says so and never asks, because there is nothing to approve', async () => {
    const { script, questions, logs } = fakeScript(undefined, { confirm: true });

    const results = await runSync(script, makeConfig({ sync: true }), [plan({ writes: [] })]);

    assert.deepEqual([...(results ?? [])], []);
    assert.deepEqual(questions, []);
    assert.ok(logs.lines.some((line) => line.includes('Nothing to write')));
  });
});

describe('runSync confirmation', () => {
  it('writes nothing when the operator says no', async () => {
    const { script, questions } = fakeScript(undefined, { confirm: false });

    const results = await runSync(script, makeConfig({ sync: true }), [plan()]);

    assert.equal(results, undefined);
    assert.equal(questions.length, 1);
  });

  it('treats a cancelled prompt as a refusal, not as a yes', async () => {
    const { script } = fakeScript(undefined, { confirm: undefined });

    assert.equal(await runSync(script, makeConfig({ sync: true }), [plan()]), undefined);
  });

  it('does not ask at all when --yes was given', async () => {
    // It still must not write here: the apply path needs a client provider the
    // fake script has none of, so a plan that reached it would throw.
    const { script, questions } = fakeScript(undefined, { confirm: false });

    await runSync(script, makeConfig({ sync: true, yes: true, dryRun: true }), [plan()]);

    assert.deepEqual(questions, []);
  });
});

describe('runSync under --dry-run', () => {
  it('asks before withholding the write, with wording that says nothing happens', async () => {
    const { script, questions, logs } = fakeScript(undefined, { confirm: true });

    const results = await runSync(script, makeConfig({ sync: true, dryRun: true }), [plan()]);

    assert.equal(questions.length, 1);
    assert.match(questions[0] ?? '', /Dry run — nothing will be written/);
    assert.deepEqual([...(results ?? [])], []);
    assert.ok(logs.warnings.some((line) => line.includes('no write was sent')));
  });

  it('asks to WRITE when it is not a dry run', async () => {
    const { script, questions } = fakeScript(undefined, { confirm: false });

    await runSync(script, makeConfig({ sync: true, env: 'uat' }), [plan()]);

    assert.match(questions[0] ?? '', /^WRITE the 1 item\(s\) above to DynamoDB on uat\?/);
  });
});

describe('runSync reporting of dropped attributes', () => {
  it('names them as errors and repeats the count in the question', async () => {
    const { script, logs, questions } = fakeScript(undefined, { confirm: false });

    await runSync(script, makeConfig({ sync: true }), [
      plan({
        writes: [
          {
            key: 'pn-test',
            item: { cxId: s('pn-test') },
            reason: 'overwrite',
            live: undefined,
            droppedAttributes: ['sesEventsList'],
          },
        ],
      }),
    ]);

    assert.ok(logs.errors.some((line) => line.includes('would DELETE attributes')));
    assert.ok(logs.errors.some((line) => line.includes('pn-test: sesEventsList')));
    assert.match(questions[0] ?? '', /1 of them DELETE attributes that exist today/);
  });

  it('says nothing about deletions when no attribute would be lost', async () => {
    const { script, logs, questions } = fakeScript(undefined, { confirm: false });

    await runSync(script, makeConfig({ sync: true }), [plan()]);

    assert.deepEqual([...logs.errors], []);
    assert.doesNotMatch(questions[0] ?? '', /DELETE/);
  });

  it('reports live-only items as left alone rather than as writes', async () => {
    const { script, logs } = fakeScript(undefined, { confirm: false });

    await runSync(script, makeConfig({ sync: true }), [plan({ untouched: 9 })]);

    assert.ok(logs.lines.some((line) => line.includes('9 item(s) exist only in the table and are left alone')));
  });
});

describe('runSync with tables the comparison could not answer for', () => {
  it('says so in the question, not only in the log above it', async () => {
    const { script, questions } = fakeScript(undefined, { confirm: false });

    await runSync(script, makeConfig({ sync: true }), [plan()], 2);

    assert.match(questions[0] ?? '', /2 table\(s\) could NOT be compared and are left untouched/);
  });

  it('still offers the write, because an unread table is never planned', async () => {
    // Two tables have no file on test. Refusing the whole run over that would
    // make --sync permanently unusable there, and would protect nothing: only
    // a drifted table is ever planned.
    const { script, questions } = fakeScript(undefined, { confirm: false });

    const results = await runSync(script, makeConfig({ sync: true }), [plan()], 2);

    assert.equal(questions.length, 1);
    assert.equal(results, undefined);
  });

  it('says nothing about them when every table was compared', async () => {
    const { script, questions } = fakeScript(undefined, { confirm: false });

    await runSync(script, makeConfig({ sync: true }), [plan()]);

    assert.doesNotMatch(questions[0] ?? '', /could NOT be compared/);
  });
});

describe('hasFailedWrites', () => {
  it('is false when every table wrote everything', () => {
    assert.equal(hasFailedWrites([{ table: 't', written: 3, failed: [], error: undefined }]), false);
  });

  it('is true when a table was refused outright', () => {
    assert.equal(hasFailedWrites([{ table: 't', written: 0, failed: [], error: 'AccessDenied' }]), true);
  });

  it('is true when some items were never accepted', () => {
    assert.equal(hasFailedWrites([{ table: 't', written: 2, failed: ['a'], error: undefined }]), true);
  });
});

describe('runSync in a dry run with no terminal', () => {
  it('previews instead of refusing, because a dry run writes nothing', async () => {
    // `prompt.confirm` resolves undefined where there is no TTY — a chain
    // step, CI — and that was read as a refusal, so the preview never ran.
    const { script, logs } = fakeScript(undefined, { confirm: undefined, canPromptUser: false });

    const results = await runSync(script, makeConfig({ sync: true, dryRun: true }), [plan()]);

    assert.deepEqual([...(results ?? [])], []);
    assert.ok(logs.warnings.some((line) => line.includes('no write was sent to DynamoDB')));
  });

  it('throws on a real run with no terminal, where the write is real', async () => {
    const { script } = fakeScript(undefined, { confirm: undefined, canPromptUser: false });

    await assert.rejects(runSync(script, makeConfig({ sync: true }), [plan()]), (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'WRITE_NEEDS_CONFIRMATION');
      return true;
    });
  });
});

describe('main, when the operator declines the write', () => {
  it('exits 1 and sends no write to DynamoDB', async () => {
    // One table whose file declares an item the (empty) live table lacks: a create.
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'send-sync-main-'));
    const directory = path.join(root, 'test', '_conf', 'confinfo', 'dynamodb');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- percorso costruito dalla mkdtemp di questo test.
    await fs.mkdir(directory, { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- percorso costruito dalla mkdtemp di questo test.
    await fs.writeFile(path.join(directory, 'pn-EcAnagrafica.json'), '{"cxId":{"S":"pn-delivery"}}\n', 'utf8');

    const commands: string[] = [];
    const { script, questions } = fakeScript(undefined, { confirm: false });
    const config = makeConfig({ configPath: root, sync: true, tableNames: ['pn-EcAnagrafica'] });
    Object.assign(script, {
      getConfiguration: async () => await Promise.resolve(config),
      aws: {
        clients: {
          getClientProvider: () => ({
            resolveAccountId: async () => await Promise.resolve('000000000000'),
            dynamoDB: {
              send: async (command: { constructor: { name: string } }) => {
                commands.push(command.constructor.name);
                return await Promise.resolve({ Items: [] });
              },
            },
          }),
        },
      },
    });
    Object.assign(script.paths, { resolvePath: () => TABLES_PATH });

    const previous = process.exitCode;
    try {
      process.exitCode = undefined;
      await main(script);
      assert.equal(process.exitCode, 1);
    } finally {
      process.exitCode = previous;
      await fs.rm(root, { recursive: true, force: true });
    }

    assert.equal(questions.length, 1, 'the operator was asked once');
    assert.deepEqual(
      commands.filter((name) => name !== 'ScanCommand'),
      [],
      'only the read happened',
    );
  });
});

describe('runSync on production', () => {
  const prod = 'sso_pn-confinfo-prod';
  const prodPlan = (): TableSyncPlan => plan({ profile: prod });

  it('asks for the profile to be typed back, which --yes does not answer', async () => {
    const { script, questions } = fakeScript(undefined, { confirm: false, typed: [undefined] });

    const results = await runSync(script, makeConfig({ sync: true, env: 'prod', yes: true }), [prodPlan()]);

    assert.equal(results, undefined);
    assert.ok(questions.some((question) => question.includes(`Type "${prod}"`)));
  });

  it('declines when the typed answer is left, so nothing is written', async () => {
    const { script } = fakeScript(undefined, { confirm: true, typed: [undefined] });

    assert.equal(await runSync(script, makeConfig({ sync: true, env: 'prod' }), [prodPlan()]), undefined);
  });

  it('asks both questions, the yes/no first and then the typed one', async () => {
    const { script, questions } = fakeScript(undefined, { confirm: true, typed: [prod] });

    // The write itself needs a real client, which the fake script has none of.
    await runSync(script, makeConfig({ sync: true, env: 'prod' }), [prodPlan()]).catch(() => undefined);

    assert.match(questions[0] ?? '', /^WRITE the 1 item\(s\) above to DynamoDB on prod\?/);
    assert.match(questions[1] ?? '', new RegExp(`Type "${prod}"`));
  });

  it('throws with no terminal even when --yes was given, because it cannot run unattended', async () => {
    const { script } = fakeScript(undefined, { confirm: undefined, canPromptUser: false });

    await assert.rejects(
      async () => await runSync(script, makeConfig({ sync: true, env: 'prod', yes: true }), [prodPlan()]),
      /needs an operator at a terminal/,
    );
  });

  it('recognises a production account whose profile name carries no marker', async () => {
    const { script, questions } = fakeScript(undefined, {
      confirm: true,
      typed: [undefined],
      accountId: '510769970275',
    });

    await runSync(script, makeConfig({ sync: true }), [plan({ profile: 'team-alias' })]);

    assert.ok(questions.some((question) => question.includes('Type "team-alias"')));
  });

  it('does not ask for typing on a dry run, which writes nothing', async () => {
    const { script, questions } = fakeScript(undefined, { confirm: true });

    await runSync(script, makeConfig({ sync: true, env: 'prod', dryRun: true }), [prodPlan()]);

    assert.equal(questions.length, 1);
  });

  it('does not ask for typing on a test profile', async () => {
    const { script, questions } = fakeScript(undefined, { confirm: false });

    await runSync(script, makeConfig({ sync: true }), [plan()]);

    assert.equal(questions.length, 1);
  });
});

/** What a fake DynamoDB client does with a command. */
type SendHandler = (command: object) => Promise<object>;

describe('runSync pre-write snapshot', () => {
  /** A plan overwriting one item whose live version differs. */
  const overwrite = (): TableSyncPlan =>
    plan({
      writes: [
        {
          key: 'pn-test',
          item: { cxId: s('pn-test') },
          reason: 'overwrite',
          live: { cxId: s('pn-test'), old: s('x') },
          droppedAttributes: ['old'],
        },
      ],
    });

  it('saves the live item before the first request is sent', async () => {
    const { script, sent, directory } = fakeScript(undefined, { confirm: true });

    // Written to disk by the time the first command reaches DynamoDB.
    const file = path.join(directory, 'pre-sync', 'pn-EcAnagrafica.json');
    let snapshotWhenFirstSent: string | undefined;
    const provider = script.aws.clients.getClientProvider('send-confinfo-test') as unknown as {
      dynamoDB: { send: SendHandler };
    };
    const send = provider.dynamoDB.send;
    provider.dynamoDB.send = async (command: object): Promise<object> => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- percorso costruito dalla mkdtemp della fixture.
      snapshotWhenFirstSent ??= await fs.readFile(file, 'utf8').catch(() => undefined);
      return await send(command);
    };

    await runSync(script, makeConfig({ sync: true }), [overwrite()]);

    assert.ok(sent.length > 0, 'the write must have been sent');
    assert.deepEqual(JSON.parse(snapshotWhenFirstSent ?? 'null'), { cxId: s('pn-test'), old: s('x') });
  });

  it('sends nothing when the snapshot cannot be written', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'send-sync-run-'));
    const blocker = path.join(root, 'file');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- percorso costruito dalla mkdtemp di questo test.
    await fs.writeFile(blocker, 'not a directory', 'utf8');
    const { script, sent } = fakeScript(path.join(blocker, 'outputs'), { confirm: true });

    await assert.rejects(
      async () => await runSync(script, makeConfig({ sync: true }), [overwrite()]),
      /Could not save the pre-write snapshot/,
    );
    assert.deepEqual(sent, []);
  });

  it('takes no snapshot on a dry run, which writes nothing', async () => {
    const { script, sent, directory } = fakeScript(undefined, { confirm: true });

    await runSync(script, makeConfig({ sync: true, dryRun: true }), [overwrite()]);

    assert.deepEqual(sent, []);
    await assert.rejects(async () => await fs.access(path.join(directory, 'pre-sync')));
  });

  it('takes no snapshot when the operator declines', async () => {
    const { script, sent, directory } = fakeScript(undefined, { confirm: false });

    await runSync(script, makeConfig({ sync: true }), [overwrite()]);

    assert.deepEqual(sent, []);
    await assert.rejects(async () => await fs.access(path.join(directory, 'pre-sync')));
  });
});
