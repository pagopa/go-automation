import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateServiceIdentity } from '../validateServiceIdentity.js';

const SERVICE = { name: 'pn-foo', logGroup: '/aws/ecs/pn-foo', varPrefix: 'foo' };

describe('validateServiceIdentity', () => {
  it('accepts a slug name, a log group and an identifier prefix', () => {
    assert.doesNotThrow(() => validateServiceIdentity('createX', 'rb', SERVICE));
  });

  it('names the builder, the runbook and the first invalid field', () => {
    const cases: ReadonlyArray<readonly [string, typeof SERVICE, RegExp]> = [
      [' ', SERVICE, /createX: id must be a non-empty string/u],
      ['rb', { ...SERVICE, name: ' ' }, /createX "rb": service\.name must be a non-empty string/u],
      ['rb', { ...SERVICE, logGroup: '' }, /service\.logGroup must be a non-empty string/u],
      ['rb', { ...SERVICE, varPrefix: '' }, /service\.varPrefix must be a non-empty string/u],
      ['rb', { ...SERVICE, name: 'pn-foo-' }, /service\.name "pn-foo-" must be a slug/u],
      ['rb', { ...SERVICE, name: 'pn_foo' }, /must be a slug/u],
      ['rb', { ...SERVICE, varPrefix: '1foo' }, /service\.varPrefix "1foo" must start with a letter/u],
    ];
    for (const [id, service, error] of cases) {
      assert.throws(() => validateServiceIdentity('createX', id, service), error);
    }
  });
});
