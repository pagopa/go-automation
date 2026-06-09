import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SERVICE_TEMPLATE } from '../templates/serviceTemplate.js';
import type { RunbookAnswers } from '../templates/RunbookAnswers.js';

function answers(): RunbookAnswers {
  return {
    templateId: 'service',
    id: 'workday-pn-foo-alarm',
    builderName: 'buildWorkdayPnFooAlarmRunbook',
    metadataName: 'ANALISI ALLARME workday-pn-foo-alarm',
    description: 'desc',
    version: '1.0.0',
    team: 'GO',
    tags: ['service'],
    extras: new Map<string, string>([
      ['service-name', 'pn-foo'],
      ['var-prefix', 'foo'],
      ['log-group', '/aws/ecs/pn-foo'],
    ]),
  };
}

describe('SERVICE_TEMPLATE', () => {
  it('builds service-specific placeholders', () => {
    const tokens = SERVICE_TEMPLATE.buildPlaceholders(answers());

    assert.strictEqual(tokens.get('SERVICE_NAME'), 'pn-foo');
    assert.strictEqual(tokens.get('SERVICE_VAR_PREFIX'), 'foo');
    assert.strictEqual(tokens.get('SERVICE_LOG_GROUP'), '/aws/ecs/pn-foo');
  });
});
