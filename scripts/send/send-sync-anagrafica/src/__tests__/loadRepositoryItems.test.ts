/**
 * Test della lettura dei file di configurazione.
 *
 * I file sono NDJSON **gia' in forma wire**: niente viene convertito, perche'
 * il confronto avviene in quella stessa forma. Un `marshall` su una di queste
 * righe produrrebbe `{"cap":{"M":{"S":{"S":"83030"}}}}`, che e' esattamente
 * cio' che fa `upsert_dynamodb` e il motivo per cui non e' il riferimento di
 * questi file.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { candidatePaths, loadRepositoryItems, parseItems } from '../libs/loadRepositoryItems.js';

const LAYOUT = { configPath: '/repo', env: 'test', confDir: '_conf', dynamodbDir: 'dynamodb' };

describe('candidatePaths', () => {
  it('looks in the environment first and the shared directory second', () => {
    const [local, global] = candidatePaths(LAYOUT, 'confinfo', 'pn-EcAnagrafica');

    assert.equal(local, '/repo/test/_conf/confinfo/dynamodb/pn-EcAnagrafica.json');
    assert.equal(global, '/repo/_conf/confinfo/dynamodb/pn-EcAnagrafica.json');
  });
});

describe('parseItems', () => {
  it('reads one item per line', () => {
    const items = parseItems('{"cap":{"S":"1"}}\n{"cap":{"S":"2"}}\n', 'f');

    assert.equal(items.length, 2);
  });

  it('keeps the wire form instead of unmarshalling it', () => {
    const items = parseItems('{"cap":{"S":"83030"},"startValidity":{"NULL":true}}', 'f');

    assert.deepEqual(items[0], { cap: { S: '83030' }, startValidity: { NULL: true } });
  });

  it('ignores blank lines and a trailing newline', () => {
    const items = parseItems('{"a":{"S":"1"}}\n\n  \n{"a":{"S":"2"}}\n', 'f');

    assert.equal(items.length, 2);
  });

  it('names the line that would not parse', () => {
    assert.throws(() => parseItems('{"a":{"S":"1"}}\nnot json\n', 'file.json'), /file\.json:2 is not valid JSON/);
  });

  it('refuses a line that is valid JSON but not an object', () => {
    assert.throws(() => parseItems('[1,2]', 'file.json'), /file\.json:1 is not a JSON object/);
  });

  it('accepts an empty file as a table that declares nothing', () => {
    assert.deepEqual([...parseItems('', 'f')], []);
  });
});

describe('loadRepositoryItems', () => {
  it('returns undefined when the table has no file, rather than throwing', async () => {
    // Two of the seventeen configured tables really have no file, and that is a
    // finding to report, not a crash.
    const result = await loadRepositoryItems(LAYOUT, 'core', 'pn-AuthJwtIssuers');

    assert.equal(result, undefined);
  });

  it('falls back to the shared directory when the environment has no file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'send-sync-repo-'));
    const shared = path.join(root, '_conf', 'core', 'dynamodb');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- percorso costruito dalla mkdtemp di questo test.
    await fs.mkdir(shared, { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- percorso costruito dalla mkdtemp di questo test.
    await fs.writeFile(path.join(shared, 'pn-PaperZone.json'), '{"countryIt":{"S":"ITALIA"}}\n', 'utf8');

    const result = await loadRepositoryItems({ ...LAYOUT, configPath: root }, 'core', 'pn-PaperZone');

    assert.equal(result?.items.length, 1);
    assert.ok(result?.source.includes(path.join('_conf', 'core')));
    await fs.rm(root, { recursive: true, force: true });
  });
});
