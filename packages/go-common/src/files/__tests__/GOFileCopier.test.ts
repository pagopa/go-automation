import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { GOFileCopier } from '../GOFileCopier.js';

interface LogEntry {
  readonly message: string;
  readonly level: 'info' | 'warn' | 'error';
}

interface ManifestFile {
  readonly totalFiles: number;
  readonly totalBytesCopied: number;
  readonly files: ReadonlyArray<{
    readonly sourcePath: string;
    readonly destinationPath: string;
    readonly subdir: string | null;
  }>;
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'go-common-file-copier-'));
}

async function writeTextFile(filePath: string, content: string): Promise<string> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

describe('GOFileCopier', () => {
  it('registers, unregisters, clears files and resolves destination paths', async () => {
    const dir = await makeTempDir();
    const sourcePath = await writeTextFile(path.join(dir, 'source.txt'), 'source');
    const executionDir = path.join(dir, 'execution');
    const logs: LogEntry[] = [];
    const copier = new GOFileCopier({
      executionDir,
      onLog: (message, level) => {
        logs.push({ message, level });
      },
    });

    copier.registerFile(sourcePath, { subdir: 'inputs' });

    assert.strictEqual(copier.isRegistered(sourcePath), true);
    assert.deepStrictEqual(copier.getRegisteredFiles(), [sourcePath]);
    assert.strictEqual(
      copier.getDestinationPath(sourcePath, 'inputs'),
      path.join(executionDir, 'inputs', 'source.txt'),
    );
    assert.strictEqual(copier.getDestinationPath(sourcePath, null), path.join(executionDir, 'source.txt'));
    assert.strictEqual(copier.unregisterFile(sourcePath), true);
    assert.strictEqual(copier.unregisterFile(sourcePath), false);

    copier.registerFile(sourcePath);
    copier.clearRegisteredFiles();

    assert.deepStrictEqual(copier.getRegisteredFiles(), []);
    assert.ok(logs.some((entry) => entry.message.includes('Registered file for copy') && entry.level === 'info'));
    assert.ok(logs.some((entry) => entry.message === 'Cleared all registered files' && entry.level === 'info'));
  });

  it('copies files, preserves timestamps, skips existing destinations and reports missing sources', async () => {
    const dir = await makeTempDir();
    const sourcePath = await writeTextFile(path.join(dir, 'source.txt'), 'alpha');
    const executionDir = path.join(dir, 'execution');
    const mtime = new Date('2026-01-02T03:04:05.000Z');
    await fs.utimes(sourcePath, mtime, mtime);
    const copier = new GOFileCopier({
      executionDir,
      preserveTimestamps: true,
    });

    const copied = await copier.copyFile(sourcePath, { subdir: 'inputs' });
    assert.strictEqual(copied.success, true);
    assert.strictEqual(copied.copied, true);
    assert.strictEqual(await fs.readFile(copied.destinationPath, 'utf-8'), 'alpha');

    const copiedStat = await fs.stat(copied.destinationPath);
    assert.ok(Math.abs(copiedStat.mtime.getTime() - mtime.getTime()) < 2000);

    const existing = await copier.copyFile(sourcePath, { subdir: 'inputs' });
    assert.strictEqual(existing.success, true);
    assert.strictEqual(existing.copied, false);
    assert.strictEqual(existing.skipReason, 'already_exists');

    const missingPath = path.join(dir, 'missing.txt');
    const missing = await copier.copyFile(missingPath);
    assert.strictEqual(missing.success, false);
    assert.strictEqual(missing.copied, false);
    assert.strictEqual(missing.skipReason, 'source_not_found');
    assert.match(missing.error ?? '', /Source file not found/);
  });

  it('skips files above max size and when an interactive prompt is declined', async () => {
    const dir = await makeTempDir();
    const sourcePath = await writeTextFile(path.join(dir, 'large.txt'), 'abcdef');
    const promptCalls: (readonly [string, string, string])[] = [];
    const declinedCopier = new GOFileCopier({
      executionDir: path.join(dir, 'declined-execution'),
      interactive: true,
      promptThreshold: 1,
      maxFileSize: 100,
      onPrompt: async (message, filePath, sizeHuman) => {
        await Promise.resolve();
        promptCalls.push([message, filePath, sizeHuman]);
        return false;
      },
    });

    const declined = await declinedCopier.copyFile(sourcePath);
    assert.strictEqual(declined.success, true);
    assert.strictEqual(declined.copied, false);
    assert.strictEqual(declined.skipReason, 'user_declined');
    assert.strictEqual(promptCalls.length, 1);
    assert.strictEqual(promptCalls[0]?.[1], sourcePath);

    const tooBigCopier = new GOFileCopier({
      executionDir: path.join(dir, 'too-big-execution'),
      interactive: false,
      maxFileSize: 2,
    });

    const tooBig = await tooBigCopier.copyFile(sourcePath);
    assert.strictEqual(tooBig.success, true);
    assert.strictEqual(tooBig.copied, false);
    assert.strictEqual(tooBig.skipReason, 'size_exceeded');
    assert.strictEqual(tooBig.sizeBytes, 6);
  });

  it('finalizes registered files with copied, skipped and failed results plus a manifest', async () => {
    const dir = await makeTempDir();
    const executionDir = path.join(dir, 'execution');
    await fs.mkdir(executionDir, { recursive: true });
    await writeTextFile(path.join(executionDir, 'blocked'), 'not a directory');

    const copiedSource = await writeTextFile(path.join(dir, 'copied.txt'), 'abc');
    const skippedSource = await writeTextFile(path.join(dir, 'skipped.txt'), 'abcdef');
    const failedSource = await writeTextFile(path.join(dir, 'failed.txt'), 'fail');
    const logs: LogEntry[] = [];
    const copier = new GOFileCopier({
      executionDir,
      interactive: false,
      maxFileSize: 4,
      generateManifest: true,
      manifestFileName: 'manifest.json',
      preserveTimestamps: false,
      onLog: (message, level) => {
        logs.push({ message, level });
      },
    });

    copier.registerFile(copiedSource, { subdir: 'files' });
    copier.registerFile(skippedSource, { subdir: 'files' });
    copier.registerFile(failedSource, { subdir: 'blocked/nested' });

    const report = await copier.finalizeRegisteredFiles();

    assert.deepStrictEqual(report.summary, {
      totalFiles: 3,
      copiedFiles: 1,
      skippedFiles: 1,
      failedFiles: 1,
      totalBytesCopied: 3,
      totalSizeCopiedHuman: '3.00 B',
    });
    assert.strictEqual(report.results[0]?.copied, true);
    assert.strictEqual(report.results[1]?.skipReason, 'size_exceeded');
    assert.strictEqual(report.results[2]?.success, false);
    assert.match(report.results[2]?.error ?? '', /ENOTDIR|not a directory/i);
    assert.deepStrictEqual(copier.getRegisteredFiles(), []);
    assert.strictEqual(copier.getAllResults().length, 3);
    assert.ok(report.manifestPath?.endsWith('manifest.json'));

    const manifest = JSON.parse(await fs.readFile(report.manifestPath ?? '', 'utf-8')) as ManifestFile;
    assert.strictEqual(manifest.totalFiles, 1);
    assert.strictEqual(manifest.totalBytesCopied, 3);
    assert.strictEqual(manifest.files[0]?.sourcePath, copiedSource);
    assert.strictEqual(manifest.files[0]?.destinationPath, path.join(executionDir, 'files', 'copied.txt'));
    assert.strictEqual(manifest.files[0]?.subdir, 'files');
    assert.ok(logs.some((entry) => entry.message.includes('Generated manifest') && entry.level === 'info'));
  });
});
