import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOConfigParameter } from '../../config/GOConfigParameter.js';
import { GOConfigParameterType } from '../../config/GOConfigParameterType.js';
import { GOScriptConfigLoader } from '../GOScriptConfigLoader.js';

describe('GOScriptConfigLoader', () => {
  it('formats missing camelCase parameters with canonical kebab-case CLI flags', () => {
    const parameter = new GOConfigParameter({
      name: 'go.ai.semanticThreshold',
      type: GOConfigParameterType.INT,
      required: true,
    });

    assert.strictEqual(GOScriptConfigLoader.formatParameterName(parameter), '--go-ai-semantic-threshold');
    assert.match(
      GOScriptConfigLoader.formatMissingParametersError(['go.ai.semanticThreshold'], [parameter]),
      /--go-ai-semantic-threshold/,
    );
  });

  it('adds a long flag prefix when legacy scripts define cliFlag without dashes', () => {
    const parameter = new GOConfigParameter({
      name: 'aws.profile',
      type: GOConfigParameterType.STRING,
      required: true,
      cliFlag: 'aws-profile',
    });

    assert.strictEqual(GOScriptConfigLoader.formatParameterName(parameter), '--aws-profile');
    assert.match(GOScriptConfigLoader.formatMissingParametersError(['aws.profile'], [parameter]), /--aws-profile/);
  });
});
