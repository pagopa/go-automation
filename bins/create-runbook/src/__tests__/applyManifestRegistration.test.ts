import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { applyManifestRegistration, renderRegistrationFile } from '../wiring/registerInCatalog.js';
import type { RunbookRegistration } from '../wiring/registerInCatalog.js';
import { CATALOG_MANIFEST_FILE, RUNBOOKS_DIR } from '../constants.js';

/**
 * The scaffolder patches the real manifest, so the tests read it from disk:
 * a fixture of its own would let the two drift apart unnoticed.
 */
const MANIFEST = readFileSync(CATALOG_MANIFEST_FILE, 'utf8');

const REGISTRATION: RunbookRegistration = {
  id: 'pn-foo-BAR-ApiGwAlarm',
  constName: 'FOO_BAR_API_GW_ALARM_REGISTRATION',
  product: 'SEND',
  kind: 'APIGW',
  categories: ['DELIVERY'],
};

describe('applyManifestRegistration', () => {
  it('adds the import after the last registration import', () => {
    const { content, changed } = applyManifestRegistration(MANIFEST, REGISTRATION);

    assert.strictEqual(changed, true);
    assert.match(
      content,
      /\/registration\.js';\nimport \{ FOO_BAR_API_GW_ALARM_REGISTRATION \} from '\.\/runbooks\/pn-foo-BAR-ApiGwAlarm\/registration\.js';/u,
    );
  });

  it('adds the entry inside the manifest array', () => {
    const { content } = applyManifestRegistration(MANIFEST, REGISTRATION);

    const arrayStart = content.indexOf('export const CATALOG_MANIFEST');
    const entryIndex = content.indexOf('  FOO_BAR_API_GW_ALARM_REGISTRATION,\n', arrayStart);
    const closeIndex = content.indexOf('];', arrayStart);

    assert.ok(entryIndex > arrayStart, 'entry should follow the array declaration');
    assert.ok(entryIndex < closeIndex, 'entry should be inside the array');
  });

  it('is idempotent when the runbook is already registered', () => {
    const once = applyManifestRegistration(MANIFEST, REGISTRATION);
    const twice = applyManifestRegistration(once.content, REGISTRATION);

    assert.strictEqual(twice.changed, false);
    assert.strictEqual(twice.content, once.content);
  });

  it('leaves every existing registration in place', () => {
    const { content } = applyManifestRegistration(MANIFEST, REGISTRATION);

    for (const line of MANIFEST.split('\n')) {
      assert.ok(content.includes(line), `missing line after patch: ${line}`);
    }
  });
});

describe('renderRegistrationFile', () => {
  it('renders the registration source', () => {
    assert.strictEqual(
      renderRegistrationFile(REGISTRATION),
      [
        `import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';`,
        '',
        `import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';`,
        `import { RunbookProducts } from '../../../types/RunbookProduct.js';`,
        `import { buildRunbook } from './runbook.js';`,
        '',
        `const KEY = 'pn-foo-BAR-ApiGwAlarm';`,
        '',
        `export const FOO_BAR_API_GW_ALARM_REGISTRATION: AutomaticRunbookRegistration = {`,
        '  key: KEY,',
        `  product: RunbookProducts.SEND,`,
        `  kind: AutomaticRunbookKinds.APIGW,`,
        `  categories: ['DELIVERY'],`,
        '  alarmNames: [KEY],',
        '  build: buildRunbook,',
        '};',
        '',
      ].join('\n'),
    );
  });

  it('quotes every category', () => {
    const rendered = renderRegistrationFile({ ...REGISTRATION, categories: ['AUTHORIZATION', 'INTEGRATION'] });

    assert.match(rendered, /categories: \['AUTHORIZATION', 'INTEGRATION'\],/u);
  });

  it('matches the field order of a hand-maintained registration', () => {
    const existing = readFileSync(path.join(RUNBOOKS_DIR, 'pn-delivery-B2B-ApiGwAlarm', 'registration.ts'), 'utf8');
    const fields = (source: string): ReadonlyArray<string> =>
      [...source.matchAll(/^ {2}(\w+):/gmu)].map((match) => match[1] ?? '');

    assert.deepStrictEqual(fields(renderRegistrationFile(REGISTRATION)), fields(existing));
  });
});
