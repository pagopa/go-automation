import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { apigw } from '../framework.js';

import { KNOWN_URLS as ADDRESS_BOOK_IO_KNOWN_URLS } from '../pn-address-book-io-IO-ApiGwAlarm/knownUrls.js';
import { KNOWN_URLS as DELIVERY_B2B_KNOWN_URLS } from '../pn-delivery-B2B-ApiGwAlarm/knownUrls.js';
import { KNOWN_URLS as DELIVERY_IO_EXP_KNOWN_URLS } from '../pn-delivery-IO_EXP-ApiGwAlarm/knownUrls.js';
import { KNOWN_URLS as DELIVERY_PUSH_B2B_KNOWN_URLS } from '../pn-delivery-push-B2B-ApiGwAlarm/knownUrls.js';

const INTERNAL_HOST_LEAK_PATTERN = /alb\.confidential|\.pn\.internal|internal-|elb\.amazonaws\.com/;

function assertNoInternalHostnames(urls: ReadonlyArray<apigw.KnownUrl>): void {
  for (const knownUrl of urls) {
    assert.doesNotMatch(knownUrl.url, INTERNAL_HOST_LEAK_PATTERN);
  }
}

function assertMatchesTarget(urls: ReadonlyArray<apigw.KnownUrl>, observedUrl: string, expectedTarget: string): void {
  const registry = new apigw.KnownUrlsRegistry(urls);
  const match = registry.match(observedUrl);

  assert.strictEqual(match?.known.target, expectedTarget);
}

describe('runbook known URLs', () => {
  it('does not expose internal hostnames in source-controlled known URL entries', () => {
    assertNoInternalHostnames(ADDRESS_BOOK_IO_KNOWN_URLS);
    assertNoInternalHostnames(DELIVERY_B2B_KNOWN_URLS);
    assertNoInternalHostnames(DELIVERY_IO_EXP_KNOWN_URLS);
    assertNoInternalHostnames(DELIVERY_PUSH_B2B_KNOWN_URLS);
  });

  it('matches delivery internal data-vault URLs by path without hard-coding the host', () => {
    const observedUrl = 'http://internal.example.local:8080/datavault-private/recipients/123';

    assertMatchesTarget(DELIVERY_B2B_KNOWN_URLS, observedUrl, 'pn-data-vault');
    assertMatchesTarget(DELIVERY_IO_EXP_KNOWN_URLS, observedUrl, 'pn-data-vault');
    assertMatchesTarget(DELIVERY_PUSH_B2B_KNOWN_URLS, observedUrl, 'pn-data-vault');
  });

  it('matches every documented pn-delivery B2B internal hop by path', () => {
    const cases = [
      ['http://internal.example.local:8080/ext-registry-private/pa/v1/groups-all', 'pn-external-registries'],
      ['http://internal.example.local:8080/f24-private/pdf/IUN?pathTokens=0%2C0', 'pn-f24'],
      ['http://vpce.example.local:8080/safe-storage/v1/files/PN_F24_META-id.json', 'pn-safestorage'],
    ] as const;

    for (const [observedUrl, target] of cases) {
      assertMatchesTarget(DELIVERY_B2B_KNOWN_URLS, observedUrl, target);
    }
  });

  it('classifies documented external downstream URLs after delivery traversal', () => {
    assertMatchesTarget(
      DELIVERY_B2B_KNOWN_URLS,
      'https://api.tokenizer.pdv.pagopa.it/tokenizer/v1/tokens/id/pii',
      'PersonalDataVault',
    );
    assertMatchesTarget(
      DELIVERY_B2B_KNOWN_URLS,
      'https://api.selfcare.pagopa.it/external/data-vault/v1/pn-pg/institutions/add',
      'Selfcare',
    );
  });

  it('matches delivery-push internal safestorage URLs by path without hard-coding the host', () => {
    assertMatchesTarget(
      DELIVERY_PUSH_B2B_KNOWN_URLS,
      'http://internal.example.local:8080/safe-storage/v1/files/PN_LEGAL_FACTS-abc.pdf',
      'pn-safestorage',
    );
  });

  it('matches address-book internal external-registries URLs by path without hard-coding the host', () => {
    assertMatchesTarget(
      ADDRESS_BOOK_IO_KNOWN_URLS,
      'http://internal.example.local:8080/ext-registry-private/io/v1/activations/abc',
      'pn-external-registries',
    );
  });
});
