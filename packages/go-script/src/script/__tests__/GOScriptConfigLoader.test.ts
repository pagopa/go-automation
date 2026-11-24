import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOConfigParameter } from '../../config/GOConfigParameter.js';
import { GOConfigParameterType } from '../../config/GOConfigParameterType.js';
import { GOConfigReader } from '../../config/GOConfigReader.js';
import { GOConfigSchema } from '../../config/GOConfigSchema.js';
import { GOInMemoryConfigProvider } from '../../config/providers/GOInMemoryConfigProvider.js';
import { yesParameter } from '../../config/yesParameter.js';
import type { GOPaths } from '../../paths/GOPaths.js';
import { GOScriptConfigLoader } from '../GOScriptConfigLoader.js';
import type { ConfigLoadResult } from '../GOScriptConfigLoader.js';

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

  describe('cliOnly parameters', () => {
    /**
     * Loads `--yes` from the given providers, highest priority first.
     *
     * @param providers - Provider name and the value it holds for `yes`
     */
    async function loadYes(providers: ReadonlyArray<readonly [string, string]>): Promise<ConfigLoadResult> {
      const schema = new GOConfigSchema();
      schema.addParameter(yesParameter('Skip the confirmation'));
      const reader = new GOConfigReader(
        providers.map(([name, value]) => new GOInMemoryConfigProvider({ name, values: { yes: value } })),
      );

      return await new GOScriptConfigLoader(schema, reader, { paths: {} as GOPaths }).load();
    }

    it('discards a value from an env var or a preset and falls back to the default', async () => {
      const result = await loadYes([
        ['Environment', 'true'],
        ['Preset(prod)', 'true'],
      ]);

      assert.equal(result.values['yes'], false);
      assert.deepEqual(result.discardedCliOnly, [{ name: 'yes', sources: ['Environment', 'Preset(prod)'] }]);
    });

    it('accepts the value from the command line or a Lambda event', async () => {
      const cli = await loadYes([
        ['CommandLine', 'true'],
        ['Environment', 'false'],
      ]);
      assert.equal(cli.values['yes'], true);
      assert.deepEqual(cli.discardedCliOnly, [{ name: 'yes', sources: ['Environment'] }]);

      const lambda = await loadYes([['LambdaEvent', 'true']]);
      assert.equal(lambda.values['yes'], true);
      assert.deepEqual(lambda.discardedCliOnly, []);
    });

    it('declares the shared --yes as a CLI-only boolean defaulting to false', () => {
      assert.deepEqual(yesParameter('Skip it'), {
        name: 'yes',
        type: GOConfigParameterType.BOOL,
        description: 'Skip it',
        required: false,
        defaultValue: false,
        aliases: ['y'],
        cliOnly: true,
      });
    });
  });
});
