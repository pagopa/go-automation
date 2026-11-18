import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOEnvFileParser } from '../GOEnvFileParser.js';
import { useTempDir } from '../../__tests__/helpers/createTempDir.js';

describe('GOEnvFileParser', () => {
  const tmp = useTempDir('go-common-env-parser-');

  it('parses env content with quotes, comments, escapes and variable expansion', () => {
    const parsed = GOEnvFileParser.parseContent(
      [
        '# comment',
        'PLAIN=hello',
        'SPACED = value with spaces # inline comment',
        'DOUBLE="line\\nquote \\"ok\\" and slash \\\\"',
        "SINGLE='literal $PLAIN'",
        'BACKTICK=`literal # hash`',
        'FROM_CURRENT=${PLAIN}/$SPACED',
        'FROM_EXISTING=$HOME_DIR',
        'ESCAPED=price \\$PLAIN',
        'NO_EQUALS',
        'EMPTY=',
      ].join('\n'),
      { HOME_DIR: '/home/test' },
    );

    assert.deepStrictEqual(
      parsed,
      new Map<string, string>([
        ['PLAIN', 'hello'],
        ['SPACED', 'value with spaces'],
        ['DOUBLE', 'line\nquote "ok" and slash \\'],
        ['SINGLE', 'literal hello'],
        ['BACKTICK', 'literal # hash'],
        ['FROM_CURRENT', 'hello/value with spaces'],
        ['FROM_EXISTING', '/home/test'],
        ['ESCAPED', 'price $PLAIN'],
        ['EMPTY', ''],
      ]),
    );
  });

  it('rejects invalid variable names with line numbers', () => {
    assert.throws(
      () => GOEnvFileParser.parseContent(['GOOD=value', '1_BAD=value'].join('\n')),
      /Invalid environment variable name at line 2: "1_BAD"/,
    );
  });

  it('parses files in order and wraps file read errors with context', async () => {
    const firstPath = await tmp.write('first.env', 'ONE=1\nSHARED=first\n');
    const secondPath = await tmp.write('second.env', 'TWO=2\nSHARED=second\n');

    assert.deepStrictEqual(
      GOEnvFileParser.parseFiles([firstPath, secondPath]),
      new Map<string, string>([
        ['ONE', '1'],
        ['SHARED', 'second'],
        ['TWO', '2'],
      ]),
    );

    assert.throws(() => GOEnvFileParser.parseFile(tmp.file('missing.env')), /Failed to parse env file .*missing\.env/);
  });
});
