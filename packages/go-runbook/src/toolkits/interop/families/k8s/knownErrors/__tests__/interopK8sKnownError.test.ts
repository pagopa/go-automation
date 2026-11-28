import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { interopK8sKnownError } from '../interopK8sKnownError.js';
import type { InteropK8sKnownErrorRefs } from '../InteropK8sKnownErrorRefs.js';

const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: 'query-app',
  cidTrackerStepId: 'query-tracker',
  varPrefix: 'app',
};

const BASE = {
  code: 'case',
  description: 'Caso',
  resolution: 'PIN-1',
  proposedStatus: 'IN_PROGRESS',
  analysisType: 'ANALYZABLE',
} as const;

describe('interopK8sKnownError', () => {
  it('matches the regex on both query steps and renders the standard rows', () => {
    const knownError = interopK8sKnownError(REFS, { ...BASE, regex: 'boom', finalActions: [] });
    assert.deepStrictEqual(knownError.condition, {
      type: 'or',
      conditions: [
        { type: 'contains', ref: 'steps.query-app', regex: 'boom' },
        { type: 'contains', ref: 'steps.query-tracker', regex: 'boom' },
      ],
    });
    assert.deepStrictEqual(knownError.action, {
      type: 'log',
      level: 'info',
      renderAs: 'known-error',
      title: 'Caso',
      details: [
        ['Risoluzione', 'PIN-1'],
        ['Ambiente', '{{vars.interopEnvironment}}'],
        ['Log group', '{{vars.interopLogGroup}}'],
        ['Servizio', '{{vars.interopPodApp}}'],
        ['CID analizzati', '{{vars.appCidCount}}'],
      ],
    });
    assert.deepStrictEqual(knownError.analysis, {
      resolution: 'PIN-1',
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
    });
  });

  it('restricts the case to its environments and to the application logs', () => {
    const one = interopK8sKnownError(REFS, {
      ...BASE,
      regex: 'boom',
      evidence: 'APPLICATION_LOGS',
      environments: ['prod'],
    });
    assert.deepStrictEqual(one.condition, {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
        { type: 'contains', ref: 'steps.query-app', regex: 'boom' },
      ],
    });
    const two = interopK8sKnownError(REFS, {
      ...BASE,
      condition: { type: 'exists', ref: 'vars.x' },
      environments: ['prod', 'test'],
    });
    assert.deepStrictEqual(two.condition, {
      type: 'and',
      conditions: [
        { type: 'contains', ref: 'vars.interopEnvironment', value: ['prod', 'test'] },
        { type: 'exists', ref: 'vars.x' },
      ],
    });
  });

  it('takes title, level, supersedes and the rows of the runbook', () => {
    const knownError = interopK8sKnownError(REFS, {
      ...BASE,
      regex: 'boom',
      title: 'Titolo',
      level: 'warn',
      supersedes: ['other'],
      details: [['Servizio', '{{vars.interopPodApp}}']],
      extraDetails: [['Nota', 'da verificare']],
    });
    assert.deepStrictEqual(knownError.supersedes, ['other']);
    assert.deepStrictEqual(knownError.action, {
      type: 'log',
      level: 'warn',
      renderAs: 'known-error',
      title: 'Titolo',
      details: [
        ['Risoluzione', 'PIN-1'],
        ['Servizio', '{{vars.interopPodApp}}'],
        ['Nota', 'da verificare'],
      ],
    });
  });

  it('rejects a case without a regex or a condition', () => {
    assert.throws(() => interopK8sKnownError(REFS, BASE), /"case": declare a regex or a condition/u);
  });
});
