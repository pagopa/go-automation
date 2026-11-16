import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { GOEnvFileParser } from '../GOEnvFileParser.js';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'go-common-env-parser-'));
}

describe('GOEnvFileParser', () => {
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
    const dir = await makeTempDir();
    const firstPath = path.join(dir, 'first.env');
    const secondPath = path.join(dir, 'second.env');
    await fs.writeFile(firstPath, 'ONE=1\nSHARED=first\n', 'utf-8');
    await fs.writeFile(secondPath, 'TWO=2\nSHARED=second\n', 'utf-8');

    assert.deepStrictEqual(
      GOEnvFileParser.parseFiles([firstPath, secondPath]),
      new Map<string, string>([
        ['ONE', '1'],
        ['SHARED', 'second'],
        ['TWO', '2'],
      ]),
    );

    assert.throws(
      () => GOEnvFileParser.parseFile(path.join(dir, 'missing.env')),
      /Failed to parse env file .*missing\.env/,
    );
  });
});
