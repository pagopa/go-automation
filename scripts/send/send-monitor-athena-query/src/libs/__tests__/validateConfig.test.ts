import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateConfig } from '../validateConfig.js';
import { createConfig } from './helpers/createConfig.js';

describe('validateConfig', () => {
  it('requires the legacy threshold field and value together', () => {
    const together = /analysis\.threshold\.field and analysis\.threshold must be provided together/;
    assert.throws(() => validateConfig(createConfig({ analysisThresholdField: 'total' })), together);
    assert.throws(() => validateConfig(createConfig({ analysisThreshold: 100 })), together);
    assert.doesNotThrow(() =>
      validateConfig(createConfig({ analysisThresholdField: 'total', analysisThreshold: 100 })),
    );
  });
});
