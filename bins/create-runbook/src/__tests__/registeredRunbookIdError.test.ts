import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { registeredRunbookIdError } from '../validation/registeredRunbookIdError.js';
import { INVENTORY_MANIFEST } from '../../../../packages/go-runbook/src/inventory/manifest.js';

const REGISTRATIONS = [
  {
    key: 'interop-auth-server-apigw-5xx',
    alarmNames: ['interop-auth-server-prod-apigw-5xx', 'interop-auth-server-att-apigw-5xx'],
  },
];

describe('registeredRunbookIdError', () => {
  it('accepts an id no registration uses', () => {
    assert.strictEqual(registeredRunbookIdError('pn-new-ApiGwAlarm', REGISTRATIONS), undefined);
  });

  it('rejects the key of a registered runbook', () => {
    assert.match(registeredRunbookIdError('interop-auth-server-apigw-5xx', REGISTRATIONS) ?? '', /già la chiave/u);
  });

  it('rejects an alarm name another runbook answers to, even when no folder has that name', () => {
    assert.match(
      registeredRunbookIdError('interop-auth-server-prod-apigw-5xx', REGISTRATIONS) ?? '',
      /nome d'allarme del runbook "interop-auth-server-apigw-5xx"/u,
    );
  });

  it('sees the aliases of the real inventory, across products', () => {
    const aliases = INVENTORY_MANIFEST.flatMap((registration) =>
      registration.alarmNames.filter((alarmName) => alarmName !== registration.key),
    );

    assert.ok(aliases.length > 0);
    for (const alias of aliases) {
      assert.notStrictEqual(registeredRunbookIdError(alias, INVENTORY_MANIFEST), undefined, alias);
    }
  });
});
