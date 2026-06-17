import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { GOPaths } from '../../../utils/GOPaths.js';
import { GOLogEvent } from '../../GOLogEvent.js';
import { GOLogEventCategory } from '../../GOLogEventCategory.js';
import { GOFileLoggerHandler } from '../GOFileLoggerHandler.js';
import { GOFileLoggerStyle } from '../GOFileLoggerStyle.js';

interface FakeGOPaths {
  getExecutionLogFilePath(): string;
}

function asGOPaths(paths: FakeGOPaths): GOPaths {
  return paths as unknown as GOPaths;
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'go-common-file-logger-'));
}

async function waitForFile(filePath: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    try {
      await fs.stat(filePath);
      return;
    } catch {
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
    }
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

function createPlainFileStyle(): GOFileLoggerStyle {
  const style = new GOFileLoggerStyle();
  style.setStyle(GOLogEventCategory.INFO, { format: 'INFO:{message}' });
  style.setStyle(GOLogEventCategory.ERROR, { format: 'ERROR:{message}' });
  style.setStyle(GOLogEventCategory.WARNING, { format: 'WARN:{message}' });
  return style;
}

describe('GOFileLoggerHandler', () => {
  it('uses the default file style and GOPaths log path when optional arguments are omitted', async () => {
    const dir = await makeTempDir();
    const logPath = path.join(dir, 'default.log');
    const handler = new GOFileLoggerHandler(
      asGOPaths({
        getExecutionLogFilePath: () => logPath,
      }),
    );

    assert.ok(handler.getStyle() instanceof GOFileLoggerStyle);

    handler.handle(GOLogEvent.info('default message'));
    await waitForFile(logPath);
    await handler.close();

    assert.match(await fs.readFile(logPath, 'utf-8'), /\[INFO\] default message/);
  });

  it('queues initial events, writes them to the configured log file and closes cleanly', async () => {
    const dir = await makeTempDir();
    const logPath = path.join(dir, 'nested', 'execution.log');
    const handler = new GOFileLoggerHandler(
      asGOPaths({
        getExecutionLogFilePath: () => path.join(dir, 'unused.log'),
      }),
      createPlainFileStyle(),
      logPath,
    );

    handler.handle(GOLogEvent.info('first'));
    handler.handle(GOLogEvent.error('second'));

    await waitForFile(logPath);
    await handler.close();

    assert.deepStrictEqual((await fs.readFile(logPath, 'utf-8')).trim().split('\n'), ['INFO:first', 'ERROR:second']);
  });

  it('keeps the stream open across reset and ignores events after close', async () => {
    const dir = await makeTempDir();
    const logPath = path.join(dir, 'execution.log');
    const handler = new GOFileLoggerHandler(
      asGOPaths({
        getExecutionLogFilePath: () => logPath,
      }),
      createPlainFileStyle(),
    );

    handler.handle(GOLogEvent.info('before reset'));
    await waitForFile(logPath);
    await handler.reset();
    handler.handle(GOLogEvent.warning('after reset'));
    await handler.close();
    handler.handle(GOLogEvent.info('after close'));

    assert.deepStrictEqual((await fs.readFile(logPath, 'utf-8')).trim().split('\n'), [
      'INFO:before reset',
      'WARN:after reset',
    ]);
  });

  it('exposes and replaces its style instance', () => {
    const initialStyle = createPlainFileStyle();
    const replacementStyle = createPlainFileStyle();
    const handler = new GOFileLoggerHandler(
      asGOPaths({
        getExecutionLogFilePath: () => '/tmp/unused.log',
      }),
      initialStyle,
    );

    assert.strictEqual(handler.getStyle(), initialStyle);

    handler.setStyle(replacementStyle);

    assert.strictEqual(handler.getStyle(), replacementStyle);
  });
});
