import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveOccurrenceTimeWindow } from '../../../computeRunbookTimeRange.js';
import { service } from '../../framework.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { MANDATE_ACCEPTANCE_FAILURE_TECH_ALARM } from '../alarmDefinition.js';
import { MANDATE_ACCEPTANCE_FAILURE_TECH_QUERY, MANDATE_TRACE_QUERY, SERVICE } from '../knownServices.js';
import { buildRunbook } from '../runbook.js';

describe('pn-mandate acceptance failure runbook', () => {
  it('builds the canonical read-only SERVICE pipeline', () => {
    const runbook = buildRunbook();

    assert.strictEqual(runbook.metadata.id, MANDATE_ACCEPTANCE_FAILURE_TECH_ALARM);
    assert.deepStrictEqual(
      runbook.steps.map(({ step }) => step.id),
      ['prepare-service-section', 'query-pn-mandate', 'analyze-pn-mandate', 'query-pn-mandate-trace'],
    );
    assert.strictEqual(runbook.knownCases.length, 1);
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.ok(service.isServiceRunbookContext(runbook.runbookContext));
    assert.deepStrictEqual(runbook.runbookContext.service, SERVICE);
    assert.strictEqual(runbook.runbookContext.queryProfileId, 'send-service');
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
  });

  it('preserves every metric-filter predicate and exposes trace_id for q2', () => {
    assert.match(MANDATE_ACCEPTANCE_FAILURE_TECH_QUERY, /level = 'ERROR'/u);
    assert.match(MANDATE_ACCEPTANCE_FAILURE_TECH_QUERY, /aud_type = 'AUD_DL_ACCEPT'/u);
    assert.match(MANDATE_ACCEPTANCE_FAILURE_TECH_QUERY, /mandate_workflow_type = 'CIE'/u);
    assert.match(MANDATE_ACCEPTANCE_FAILURE_TECH_QUERY, /error_category = 'TECH'/u);
    assert.match(MANDATE_ACCEPTANCE_FAILURE_TECH_QUERY, /display[^\n]*trace_id/u);
    assert.match(MANDATE_TRACE_QUERY, /filter @message like '\{\{TRACE_ID\}\}'/u);
  });

  it('publishes the document and the primary resource in analysis defaults', () => {
    const runbook = buildRunbook();

    assert.deepStrictEqual(runbook.analysisDefaults, {
      runbookName: MANDATE_ACCEPTANCE_FAILURE_TECH_ALARM,
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3294593025/pn-mandate-acceptance-failure-tech-Alarm',
          name: MANDATE_ACCEPTANCE_FAILURE_TECH_ALARM,
          type: 'CONFLUENCE',
        },
      ],
      resources: [{ name: 'pn-mandate', role: 'PRIMARY' }],
    });
  });

  it('uses the catalog 5/5 occurrence window because Confluence declares none', () => {
    const runbook = buildRunbook();

    assert.strictEqual(runbook.occurrenceTimeWindow, undefined);
    assert.deepStrictEqual(resolveOccurrenceTimeWindow(runbook), { beforeMinutes: 5, afterMinutes: 5 });
  });
});
