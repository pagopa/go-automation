import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOConfigHelpGenerator } from '../GOConfigHelpGenerator.js';
import { GOConfigParameter } from '../GOConfigParameter.js';
import type { GOConfigParameterOptions } from '../GOConfigParameter.js';
import { GOConfigParameterType } from '../GOConfigParameterType.js';

function createParameter(options: GOConfigParameterOptions): GOConfigParameter {
  return new GOConfigParameter(options);
}

describe('GOConfigHelpGenerator', () => {
  it('generates full help with program information, usage, groups, defaults, env vars and aliases', () => {
    const generator = new GOConfigHelpGenerator({
      programName: 'go-tool',
      version: '2.0.0',
      description: 'Runs an operational task',
      usage: ['go-tool --input-file data.json'],
      showProgramInfos: true,
      columnWidth: 26,
    });
    const output = generator.generate([
      createParameter({
        name: 'input.file',
        type: GOConfigParameterType.STRING,
        required: true,
        abstract: 'Input file',
        group: 'Input',
        aliases: ['i'],
      }),
      createParameter({
        name: 'output.format',
        type: GOConfigParameterType.STRING,
        defaultValue: 'json',
        abstract: 'Output format',
        group: 'Output',
      }),
    ]);

    assert.match(output, /go-tool v2\.0\.0/);
    assert.match(output, /Runs an operational task/);
    assert.match(output, /Usage:\n {2}go-tool --input-file data\.json/);
    assert.match(output, /Input\n\n {2}--input-file <value>\s+\(required\) Input file/);
    assert.match(output, /env: INPUT_FILE/);
    assert.match(output, /aliases: i/);
    assert.match(output, /Output\n\n {2}--output-format <value>\s+Output format \[default: "json"\]/);
  });

  it('uses custom header and footer and excludes deprecated parameters by default', () => {
    const generator = new GOConfigHelpGenerator({
      header: 'CUSTOM HEADER',
      footer: 'CUSTOM FOOTER',
      showProgramInfos: true,
    });

    const output = generator.generate([
      createParameter({
        name: 'active',
        type: GOConfigParameterType.BOOL,
        abstract: 'Active option',
      }),
      createParameter({
        name: 'legacy',
        type: GOConfigParameterType.STRING,
        abstract: 'Legacy option',
        deprecated: true,
      }),
    ]);

    assert.match(output, /^CUSTOM HEADER/);
    assert.match(output, /CUSTOM FOOTER$/);
    assert.match(output, /--active/);
    assert.doesNotMatch(output, /legacy/);
  });

  it('can include deprecated parameters and hide defaults and environment variables', () => {
    const generator = new GOConfigHelpGenerator({
      includeDeprecated: true,
      showDefaults: false,
      showEnvVars: false,
      columnWidth: 24,
    });

    const output = generator.generate([
      createParameter({
        name: 'legacy.mode',
        type: GOConfigParameterType.STRING,
        abstract: 'Old mode',
        defaultValue: 'compat',
        deprecated: true,
      }),
    ]);

    assert.match(output, /DEPRECATED Old mode/);
    assert.doesNotMatch(output, /default:/);
    assert.doesNotMatch(output, /env:/);
  });

  it('generates compact help and usage strings', () => {
    const generator = new GOConfigHelpGenerator({ programName: 'go-tool', columnWidth: 28 });
    const parameters = [
      createParameter({
        name: 'input.file',
        type: GOConfigParameterType.STRING,
        required: true,
        abstract: 'Input file',
      }),
      createParameter({
        name: 'dry.run',
        type: GOConfigParameterType.BOOL,
        abstract: 'Preview changes',
      }),
    ];

    const compact = generator.generateCompact(parameters);
    assert.match(compact, /--dry-run\s+Preview changes/);
    assert.match(compact, /--input-file <value>\s+Input file/);
    assert.strictEqual(generator.generateUsageString(parameters), 'go-tool --input-file <value> [options]');
  });

  it('generates detailed parameter help with wrapped descriptions and deprecation metadata', () => {
    const generator = new GOConfigHelpGenerator({ showEnvVars: true });
    const detail = generator.generateParameterDetail(
      createParameter({
        name: 'aws.profile',
        type: GOConfigParameterType.STRING,
        aliases: ['p', 'profile'],
        required: true,
        defaultValue: 'sso-dev',
        abstract: 'AWS profile',
        description:
          'Selects the AWS profile used by the operation and documents how long descriptions are wrapped in help output.',
        help: 'go-tool --aws-profile sso-dev',
        deprecated: true,
        deprecationMessage: 'Use aws.profiles instead.',
      }),
    );

    assert.match(detail, /Parameter: Aws Profile/);
    assert.match(detail, /Key: aws\.profile/);
    assert.match(detail, /Aliases: p, profile/);
    assert.match(detail, /Environment: AWS_PROFILE/);
    assert.match(detail, /Required: yes/);
    assert.match(detail, /Default: "sso-dev"/);
    assert.match(detail, /Description:/);
    assert.match(detail, /Help:/);
    assert.match(detail, /DEPRECATED/);
    assert.match(detail, /Use aws\.profiles instead\./);
  });
});
