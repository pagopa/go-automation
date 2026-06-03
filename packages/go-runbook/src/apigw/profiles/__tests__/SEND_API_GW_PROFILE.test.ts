import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SEND_API_GW_PROFILE } from '../SEND_API_GW_PROFILE.js';

describe('SEND_API_GW_PROFILE', () => {
  it('has id "send"', () => {
    assert.strictEqual(SEND_API_GW_PROFILE.id, 'send');
  });

  describe('accessLog', () => {
    it('contains {{minStatusCode}} placeholder', () => {
      assert.match(SEND_API_GW_PROFILE.accessLog.query, /\{\{minStatusCode\}\}/);
    });

    it('orders higher status classes first and returns a single 1000-row block', () => {
      assert.match(
        SEND_API_GW_PROFILE.accessLog.query,
        /\| sort status desc, authorizerStatus desc, integrationServiceStatus desc, @timestamp asc/,
      );
      assert.match(SEND_API_GW_PROFILE.accessLog.query, /\| limit 1000/);
    });

    it('scans status, authorizerStatus and integrationServiceStatus in this order', () => {
      assert.deepStrictEqual(SEND_API_GW_PROFILE.accessLog.schema.statusFields, [
        'status',
        'authorizerStatus',
        'integrationServiceStatus',
      ]);
    });

    it('declares all the semantic fields explicitly', () => {
      const s = SEND_API_GW_PROFILE.accessLog.schema;
      assert.strictEqual(s.traceIdField, 'xrayTraceId');
      assert.strictEqual(s.traceIdLabel, 'X-Ray Trace ID');
      assert.strictEqual(s.traceIdContextVar, 'xRayTraceId');
      assert.strictEqual(s.traceIdExtractPattern, 'Root=([^\\s]+)');
      assert.strictEqual(s.errorMessageField, 'errorMessage');
      assert.strictEqual(s.pathField, 'path');
      assert.strictEqual(s.httpMethodField, 'httpMethod');
      assert.strictEqual(s.requestIdField, 'requestId');
    });

    it('declares notApplicableSentinels === ["-"]', () => {
      assert.deepStrictEqual(SEND_API_GW_PROFILE.accessLog.schema.notApplicableSentinels, ['-']);
    });

    it('maps known CW fields to context vars', () => {
      const mapping = new Map(SEND_API_GW_PROFILE.accessLog.schema.fieldToVar);
      assert.strictEqual(mapping.get('errorMessage'), 'apiGwErrorMessage');
      assert.strictEqual(mapping.get('httpMethod'), 'apiGwHttpMethod');
      assert.strictEqual(mapping.get('path'), 'apiGwPath');
      assert.strictEqual(mapping.get('authorizerStatus'), 'apiGwAuthorizerStatus');
      assert.strictEqual(mapping.get('authorizerLatency'), 'apiGwAuthorizerLatency');
      assert.strictEqual(mapping.get('authorizerRequestId'), 'apiGwAuthorizerRequestId');
      assert.strictEqual(mapping.get('integrationServiceStatus'), 'apiGwIntegrationServiceStatus');
      assert.strictEqual(mapping.get('requestId'), 'apiGwRequestId');
      assert.strictEqual(mapping.get('integrationRequestId'), 'apiGwIntegrationRequestId');
    });

    it('declares authorizer fields used by the authorizer failure gate', () => {
      assert.deepStrictEqual(SEND_API_GW_PROFILE.accessLog.schema.authorizer, {
        statusFields: ['authorizerStatus'],
        latencyFields: ['authorizerLatency'],
        requestIdFields: ['authorizerRequestId'],
      });
    });
  });

  describe('serviceLog', () => {
    it('contains {{FILTER_CLAUSE}} placeholder', () => {
      assert.match(SEND_API_GW_PROFILE.serviceLog.queryTemplate, /\{\{FILTER_CLAUSE\}\}/);
    });

    it('uses @message like for both trace and fallback predicates (SEND legacy)', () => {
      assert.strictEqual(SEND_API_GW_PROFILE.serviceLog.tracePredicateTemplate, `@message like '{{VALUE}}'`);
      assert.strictEqual(SEND_API_GW_PROFILE.serviceLog.fallbackPredicateTemplate, `@message like '{{VALUE}}'`);
    });

    it('returns at most 1000 service log rows', () => {
      assert.match(SEND_API_GW_PROFILE.serviceLog.queryTemplate, /\| limit 1000/);
    });

    it('declares messageFieldCandidates with message before @message', () => {
      assert.deepStrictEqual(SEND_API_GW_PROFILE.serviceLog.schema.messageFieldCandidates, ['message', '@message']);
    });
  });

  describe('executionLog', () => {
    it('is present (SEND has execution log capability)', () => {
      assert.notStrictEqual(SEND_API_GW_PROFILE.executionLog, undefined);
    });

    it('contains {{REQUEST_ID_FILTER_CLAUSE}} placeholder', () => {
      assert.match(SEND_API_GW_PROFILE.executionLog?.queryTemplate ?? '', /\{\{REQUEST_ID_FILTER_CLAUSE\}\}/);
    });

    it('uses @message like for requestId predicate', () => {
      assert.strictEqual(SEND_API_GW_PROFILE.executionLog?.requestIdPredicateTemplate, `@message like '{{VALUE}}'`);
    });

    it('returns at most 1000 execution log rows', () => {
      assert.match(SEND_API_GW_PROFILE.executionLog?.queryTemplate ?? '', /\| limit 1000/);
    });

    it('limits the OR clause to 50 requestIds', () => {
      assert.strictEqual(SEND_API_GW_PROFILE.executionLog?.maxRequestIds, 50);
    });
  });
});
