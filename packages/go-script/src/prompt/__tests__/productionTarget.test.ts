/**
 * Tests of `isProductionTarget` and `isProductionIdentifier`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isProductionIdentifier, isProductionTarget } from '../productionTarget.js';

const prodProfile = { label: 'sso_pn-core-prod', profile: 'sso_pn-core-prod' };
const devProfile = { label: 'sso_pn-core-dev', profile: 'sso_pn-core-dev' };

describe('isProductionTarget', () => {
  it('matches on the name tokens of the label or the profile', () => {
    assert.equal(isProductionTarget(prodProfile), true);
    assert.equal(isProductionTarget({ label: 'queue', profile: 'interopprd' }), true);
    assert.equal(isProductionTarget(devProfile), false);
  });

  it('matches on the account id when the profile name carries no marker', () => {
    assert.equal(isProductionTarget({ label: 'my-alias', profile: 'my-alias', accountId: '510769970275' }), true);
    assert.equal(isProductionTarget({ label: 'my-alias', profile: 'my-alias', accountId: '000000000000' }), false);
  });

  it('counts the INTEROP safe-storage and Watchtower production accounts', () => {
    assert.equal(isProductionTarget({ label: 'my-alias', profile: 'my-alias', accountId: '730335668132' }), true);
    assert.equal(isProductionTarget({ label: 'my-alias', profile: 'my-alias', accountId: '170533023216' }), true);
  });

  it('matches on the URL host, and on the caller verdict, which can only add', () => {
    assert.equal(isProductionTarget({ label: 'wt', url: 'https://api.prod.example.it/v1' }), true);
    assert.equal(isProductionTarget({ label: 'wt', url: 'not a url prod' }), true);
    assert.equal(isProductionTarget({ label: 'wt', url: 'https://api.dev.example.it' }), false);
    assert.equal(isProductionTarget({ label: 'GO', isProduction: true }), true);
    assert.equal(isProductionTarget({ ...prodProfile, isProduction: false }), true);
  });

  it('matches whole tokens, not substrings', () => {
    assert.equal(isProductionIdentifier('reproduce-queue'), false);
    assert.equal(isProductionIdentifier('SEND-PROD'), true);
  });

  it('matches a production marker followed by digits', () => {
    assert.equal(isProductionIdentifier('sso_pn-core-prod2'), true);
    assert.equal(isProductionIdentifier('core-prod01'), true);
    assert.equal(isProductionIdentifier('pn-prd1'), true);
  });

  it('does not match words that merely start with a marker', () => {
    assert.equal(isProductionIdentifier('k8s-interop-be-producer-keychain-readmodel-writer-sql-errors'), false);
    assert.equal(isProductionIdentifier('bff-selfcare-products-retrieval-error'), false);
    assert.equal(isProductionIdentifier('reproduce-queue'), false);
    assert.equal(isProductionIdentifier('sso_pn-core-dev'), false);
  });
});
