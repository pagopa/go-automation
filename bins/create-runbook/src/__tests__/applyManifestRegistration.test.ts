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

  it('registers a runbook whose constant is a suffix of an existing one', () => {
    // The manifest already imports SELFCARE_ONBOARDING_CONSUMER_REGISTRATION.
    // A substring test reported this one as registered, so its registration.ts
    // was written but the manifest never imported it.
    const suffix: RunbookRegistration = {
      ...REGISTRATION,
      id: 'onboarding-consumer',
      constName: 'ONBOARDING_CONSUMER_REGISTRATION',
    };
    const { content, changed } = applyManifestRegistration(MANIFEST, suffix);

    assert.strictEqual(changed, true);
    assert.match(
      content,
      /import \{ ONBOARDING_CONSUMER_REGISTRATION \} from '\.\/runbooks\/onboarding-consumer\/registration\.js';/u,
    );
  });

  it('rejects a constant another runbook already exports, which would not compile', () => {
    const collision: RunbookRegistration = {
      ...REGISTRATION,
      id: 'another-runbook',
      constName: 'SELFCARE_APIGW_REGISTRATION',
    };

    assert.throws(
      () => applyManifestRegistration(MANIFEST, collision),
      /importa già SELFCARE_APIGW_REGISTRATION da runbooks\/interop-selfcare/u,
    );
  });

  it('completes a half-wired manifest instead of reporting it as registered', () => {
    const withImportOnly = applyManifestRegistration(MANIFEST, REGISTRATION).content.replace(
      `  ${REGISTRATION.constName},\n`,
      '',
    );

    const { content, changed } = applyManifestRegistration(withImportOnly, REGISTRATION);

    assert.strictEqual(changed, true);
    assert.ok(content.includes(`  ${REGISTRATION.constName},\n`), 'the missing array entry should be added');
    const imports = [...content.matchAll(/import \{ FOO_BAR_API_GW_ALARM_REGISTRATION \}/gu)];
    assert.strictEqual(imports.length, 1, 'the existing import should not be duplicated');
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
