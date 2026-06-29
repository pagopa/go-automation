import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOConfigHelpGenerator } from '../GOConfigHelpGenerator.js';
import { GOConfigParameter } from '../GOConfigParameter.js';
import type { GOConfigParameterOptions } from '../GOConfigParameter.js';
import { GOConfigParameterType } from '../GOConfigParameterType.js';
import { stripAnsi } from '../../logging/ansi.js';

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
      lineWidth: 70,
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
    assert.match(output, /Usage: go-tool --input-file data\.json/);
    assert.match(output, /Input:\n\n {2}-i, --input-file <value>\n {10}Input file/);
    assert.match(output, /Required: yes/);
    assert.match(output, /Environment: INPUT_FILE/);
    assert.match(output, /Output:\n\n {6}--output-format <value>\n {10}Output format/);
    assert.match(output, /Default: "json"/);
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

    assert.match(output, /Deprecated/);
    assert.doesNotMatch(output, /Default:/);
    assert.doesNotMatch(output, /Environment:/);
  });

  it('wraps detailed descriptions below declarations and aligns alternate usage lines', () => {
    const generator = new GOConfigHelpGenerator({
      programName: 'go-tool',
      usage: ['go-tool [OPTIONS]', 'go-tool inspect [OPTIONS]'],
      lineWidth: 60,
    });
    const output = generator.generate([
      createParameter({
        name: 'nonprintable.notation',
        type: GOConfigParameterType.STRING,
        description: 'Set the notation used to render non-printable characters while preserving readable output.',
        cliFlag: 'nonprintable-notation',
        aliases: ['n'],
      }),
    ]);

    assert.match(output, /^Usage: go-tool \[OPTIONS\]\n {7}go-tool inspect \[OPTIONS\]/);
    assert.match(output, /Options:\n\n {2}-n, --nonprintable-notation <value>/);
    assert.match(
      output,
      / {10}Set the notation used to render non-printable\n {10}characters while preserving readable output\./,
    );
  });

  it('keeps wrapped descriptions and metadata within a narrow line width', () => {
    const output = new GOConfigHelpGenerator({
      lineWidth: 25,
      showEnvVars: false,
    }).generate([
      createParameter({
        name: 'value',
        type: GOConfigParameterType.STRING,
        description: '12345678901234567890 second',
        defaultValue: '12345678901234567890',
      }),
    ]);
    const wrappedLines = output.split('\n').filter((line) => line.startsWith('          '));

    assert.deepStrictEqual(wrappedLines, [
      '          123456789012345',
      '          67890 second',
      '          Default:',
      '          "12345678901234',
      '          567890"',
    ]);
    assert.ok(wrappedLines.every((line) => line.length <= 25));
  });

  it('colors headings, flags and placeholders without changing the plain-text layout', () => {
    const parameter = createParameter({
      name: 'output.format',
      type: GOConfigParameterType.STRING,
      description: 'Output format',
      aliases: ['o'],
    });
    const colored = new GOConfigHelpGenerator({
      programName: 'go-tool',
      usage: ['go-tool [OPTIONS]'],
      colors: true,
    }).generate([parameter]);
    const plain = new GOConfigHelpGenerator({
      programName: 'go-tool',
      usage: ['go-tool [OPTIONS]'],
      colors: false,
    }).generate([parameter]);

    assert.ok(colored.includes('\x1b[33mUsage:\x1b[0m'));
    assert.ok(colored.includes('\x1b[33mOptions:\x1b[0m'));
    assert.ok(colored.includes('\x1b[32m-o\x1b[0m, \x1b[32m--output-format\x1b[0m'));
    assert.ok(colored.includes('\x1b[35m<value>\x1b[0m'));
    assert.strictEqual(stripAnsi(colored), plain);
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
    assert.match(detail, /Aliases: -p, -profile/);
    assert.match(detail, /Environment: AWS_PROFILE/);
    assert.match(detail, /Required: yes/);
    assert.match(detail, /Default: "sso-dev"/);
    assert.match(detail, /Description:/);
    assert.match(detail, /Help:/);
    assert.match(detail, /DEPRECATED/);
    assert.match(detail, /Use aws\.profiles instead\./);
  });
});
