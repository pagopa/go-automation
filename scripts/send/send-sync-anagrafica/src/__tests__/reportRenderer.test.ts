/**
 * Test dei rifiuti e del codice di uscita.
 *
 * L'invariante sottile e' il codice di uscita: **la drift non e' un
 * fallimento** in una run di confronto, e' la risposta che si era chiesta.
 * Fallisce la run il non poter rispondere — una scan rifiutata, un file che
 * non si parsa — e un file che dichiara un item dell'ambiente.
 *
 * Una tabella senza file e un file senza configurazione sono *riportati* ma
 * non fanno fallire: due tabelle sono dichiarate e non hanno file in nessuno
 * dei cinque alberi, quindi una run completa usciva 1 ovunque.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  assertEnvironment,
  assertKnownTables,
  assertProfilesMatchEnvironment,
  assertResourcesConfigured,
} from '../libs/assertInputs.js';
import {
  exportOutcomes,
  hasBlocking,
  needsAttention,
  renderOutcomes,
  renderSummary,
  unconfiguredOutcomes,
} from '../libs/reportRenderer.js';
import type { TableOutcome, TableStatus } from '../types/index.js';

import { fakeScript, makeConfig } from './fixtures.js';

function outcome(status: TableStatus): TableOutcome {
  return {
    table: 'pn-EcAnagrafica',
    account: 'confinfo',
    profile: 'send-confinfo-test',
    status,
    detail: '',
    different: [],
    onlyLive: [],
    onlyRepository: [],
    protectedItems: [],
    protectedInFile: [],
  };
}

describe('assertEnvironment', () => {
  for (const env of ['test', 'uat', 'hotfix']) {
    it(`accepts ${env}`, () => {
      assert.doesNotThrow(() => assertEnvironment(makeConfig({ env })));
    });
  }

  it('refuses dev', () => {
    assert.throws(() => assertEnvironment(makeConfig({ env: 'dev' })), /this script serves/);
  });

  it('serves production for the comparison and for --sync, whatever environments.allowed says', () => {
    // The write is gated per profile by the typed confirmation in runSync, so
    // an environments.allowed that omits prod cannot be what stops or admits it.
    for (const sync of [false, true]) {
      assert.doesNotThrow(() => assertEnvironment(makeConfig({ env: 'prod', sync, environmentsAllowed: ['test'] })));
    }
  });
});

describe('assertResourcesConfigured', () => {
  it('accepts a configuration that carries every resource name', () => {
    assert.doesNotThrow(() => assertResourcesConfigured(makeConfig()));
  });

  it('names each flag that came from nowhere, and where it should have come from', () => {
    const config = makeConfig({ accountsCore: undefined, environmentsAllowed: [] } as never);

    assert.throws(
      () => assertResourcesConfigured(config),
      /--accounts-core, --environments-allowed.*configs\/config\.json/s,
    );
  });
});

describe('assertProfilesMatchEnvironment', () => {
  it('refuses profiles that name another environment', () => {
    // Reading hotfix files and writing uat tables is the one mistake this
    // script must not make, and nothing stopped it: --env picks the tree,
    // the profiles pick the accounts, and the two never had to agree.
    assert.throws(
      () =>
        assertProfilesMatchEnvironment(
          makeConfig({ env: 'hotfix', awsProfiles: ['sso_pn-core-uat', 'sso_pn-confinfo-uat'] }),
        ),
      /does not name that environment/,
    );
  });

  it('accepts profiles of the environment being read', () => {
    assert.doesNotThrow(() =>
      assertProfilesMatchEnvironment(
        makeConfig({ env: 'test', awsProfiles: ['sso_pn-core-test', 'sso_pn-confinfo-test'] }),
      ),
    );
  });
});

describe('assertKnownTables', () => {
  it('refuses a table the map does not declare, and lists the ones it does', () => {
    assert.throws(() => assertKnownTables(['pn-Nope'], ['pn-EcAnagrafica']), /Unknown table\(s\): pn-Nope/);
  });

  it('accepts an empty request, which means every table', () => {
    assert.doesNotThrow(() => assertKnownTables([], ['pn-EcAnagrafica']));
  });
});

describe('hasBlocking', () => {
  for (const status of ['failed', 'protected-in-file'] as const) {
    it(`is true for ${status}, whatever was asked for`, () => {
      assert.equal(hasBlocking([outcome(status)], false), true);
    });
  }

  for (const status of ['missing-file', 'unconfigured'] as const) {
    it(`is false for ${status} by default, because two tables are always like that`, () => {
      // pn-AuthJwtIssuers and pn-AuthJwtAttributes are declared and have no
      // file in any of the five trees, so a full run exited 1 everywhere.
      assert.equal(hasBlocking([outcome(status)], false), false);
    });

    it(`is true for ${status} under --strict-configuration`, () => {
      assert.equal(hasBlocking([outcome(status)], true), true);
    });
  }

  it('is false for drift, which is the answer the run asked for', () => {
    assert.equal(hasBlocking([outcome('drifted')], false), false);
  });

  it('is false for a clean run', () => {
    assert.equal(hasBlocking([outcome('aligned')], false), false);
  });

  it('blocks on a file declaring a protected item, which is what stops a sync', () => {
    // main refuses to write when anything carries it, so this is the only
    // thing standing between a file that claims pn-cons-000 and a put over it.
    assert.equal(hasBlocking([outcome('protected-in-file'), outcome('aligned')], false), true);
  });
});

describe('not-defined', () => {
  it('neither blocks the run nor needs attention, even under --strict-configuration', () => {
    assert.equal(hasBlocking([outcome('not-defined')], true), false);
    assert.equal(needsAttention(outcome('not-defined')), false);
  });
});

describe('needsAttention', () => {
  for (const status of ['missing-file', 'unconfigured', 'failed', 'protected-in-file'] as const) {
    it(`is true for ${status}, so the confirmation names it whatever the exit code is`, () => {
      assert.equal(needsAttention(outcome(status)), true);
    });
  }

  for (const status of ['aligned', 'drifted'] as const) {
    it(`is false for ${status}, which is an answer`, () => {
      assert.equal(needsAttention(outcome(status)), false);
    });
  }
});

describe('unconfiguredOutcomes', () => {
  it('turns an undeclared file into a reported outcome', () => {
    const [entry] = unconfiguredOutcomes([
      { account: 'core', source: '/repo/test/_conf/core/dynamodb/pn-stray.json', name: 'pn-stray' },
    ]);

    assert.equal(entry?.status, 'unconfigured');
    assert.equal(entry?.table, 'pn-stray');
    assert.ok(needsAttention(entry ?? outcome('aligned')));
  });
});

describe('renderOutcomes', () => {
  it('prints one header per account', () => {
    const { script, logs } = fakeScript();

    renderOutcomes(script, [
      outcome('aligned'),
      { ...outcome('aligned'), table: 'pn-SmStates' },
      { ...outcome('aligned'), account: 'core', profile: 'send-core-test' },
    ]);

    assert.deepEqual(logs.sections, ['confinfo (send-confinfo-test)', 'core (send-core-test)']);
  });

  it('sends a blocking status to the error channel and drift to the warning one', () => {
    const { script, logs } = fakeScript();

    renderOutcomes(script, [outcome('failed'), outcome('drifted')]);

    assert.equal(logs.errors.length, 1);
    assert.equal(logs.warnings.length, 1);
  });

  it('lists a sample of what differs and says how much it left out', () => {
    const { script, logs } = fakeScript();
    const many = Array.from({ length: 8 }, (_, index) => ({
      key: `k${String(index)}`,
      live: {},
      repository: undefined,
    }));

    renderOutcomes(script, [{ ...outcome('drifted'), onlyLive: many }]);

    assert.ok(logs.lines.some((line) => line.includes('only in the table: k0')));
    assert.ok(logs.lines.some((line) => line.includes('3 more, in the report')));
  });
});

describe('renderSummary', () => {
  it('tallies the statuses and counts the protected items apart', () => {
    const { script, logs } = fakeScript();

    renderSummary(script, [
      outcome('aligned'),
      { ...outcome('drifted'), onlyLive: [{ key: 'a', live: {}, repository: undefined }] },
      { ...outcome('aligned'), protectedItems: [{ key: 'pn-cons-000', live: {}, repository: undefined }] },
    ]);

    const text = logs.lines.join(' ');
    assert.match(text, /3 table\(s\)/);
    assert.match(text, /1 drifted/);
    assert.match(text, /1 item\(s\) differ/);
    assert.match(text, /1 protected item\(s\)/);
  });
});

describe('exportOutcomes', () => {
  it('writes the report when a file is asked for', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'send-sync-report-'));
    const { script } = fakeScript(directory);

    await exportOutcomes(script, 'report.json', 'json', [outcome('drifted')]);

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- percorso costruito dalla mkdtemp di questo test.
    const written = await fs.readFile(path.join(directory, 'report.json'), 'utf8');
    assert.match(written, /pn-EcAnagrafica/);
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('writes nothing when no file was asked for', async () => {
    const { script, logs } = fakeScript();

    await exportOutcomes(script, undefined, 'json', [outcome('aligned')]);

    assert.ok(!logs.lines.some((line) => line.includes('Report written')));
  });

  it('writes nothing when there is nothing to report', async () => {
    const { script, logs } = fakeScript();

    await exportOutcomes(script, 'report.json', 'json', []);

    assert.ok(!logs.lines.some((line) => line.includes('Report written')));
  });
});
