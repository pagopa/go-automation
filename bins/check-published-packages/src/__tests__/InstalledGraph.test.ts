import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { checkEngines } from '../checkEngines.js';
import { InstalledGraph } from '../InstalledGraph.js';
import type { PackedPackage } from '../types/PackedPackage.js';

async function writeManifest(directory: string, manifest: Readonly<Record<string, unknown>>): Promise<void> {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ version: '1.0.0', ...manifest }));
}

function packed(name: string, enginesNode: string): PackedPackage {
  return { name, version: '1.0.0', tarball: '', enginesNode, subpaths: ['.'], internalDependencies: [] };
}

describe('InstalledGraph and checkEngines (EVO-PKGPUB-OPUS-01 §8.1, §10.2)', () => {
  let consumer = '';

  before(async () => {
    consumer = await fs.mkdtemp(path.join(os.tmpdir(), 'installed-graph-test-'));
    // pnpm-like layout: the runbook package lives in the store, its dependencies are its siblings.
    const store = path.join(consumer, 'node_modules', '.pnpm', 'runbook', 'node_modules');
    await writeManifest(path.join(store, '@pagopa', 'runbook'), {
      name: '@pagopa/runbook',
      engines: { node: '>=22.19.0' },
      dependencies: { '@pagopa/aws': '1.0.0' },
      peerDependencies: { 'sdk-not-installed': '1.0.0' },
    });
    await writeManifest(path.join(store, '@pagopa', 'aws'), {
      name: '@pagopa/aws',
      engines: { node: '^22.19.0 || >=24.0.0' },
      dependencies: { leaf: '1.0.0' },
    });
    await writeManifest(path.join(store, 'leaf'), { name: 'leaf', engines: { node: '>=20.0.0' } });
    await fs.mkdir(path.join(consumer, 'node_modules', '@pagopa'), { recursive: true });
    await fs.symlink(path.join(store, '@pagopa', 'runbook'), path.join(consumer, 'node_modules', '@pagopa', 'runbook'));
  });

  after(async () => {
    await fs.rm(consumer, { recursive: true, force: true });
  });

  it('follows dependencies through symlinks and sibling folders, skipping peers that are not installed', async () => {
    const graph = new InstalledGraph();
    const start = await graph.resolve(consumer, '@pagopa/runbook');
    assert.ok(start !== undefined);
    const names = (await graph.closure(start)).map((node) => node.name).sort();
    assert.deepStrictEqual(names, ['@pagopa/aws', '@pagopa/runbook', 'leaf']);
    assert.strictEqual(await graph.resolve(consumer, 'missing'), undefined);
  });

  it('checks a package against its internal dependencies, never against its consumers', async () => {
    const failures = await checkEngines(
      consumer,
      ['@pagopa/runbook'],
      [packed('@pagopa/runbook', '>=22.19.0'), packed('@pagopa/aws', '^22.19.0 || >=24.0.0')],
    );
    // runbook promises Node 23, which its dependency aws rejects; aws itself is fine against leaf.
    assert.strictEqual(failures.length, 1);
    assert.match(failures[0] ?? '', /@pagopa\/runbook declares node >=22\.19\.0, but @pagopa\/aws@1\.0\.0 requires/u);
  });

  it('reports a published package that the installed tree does not reach', async () => {
    const failures = await checkEngines(consumer, ['@pagopa/runbook'], [packed('@pagopa/ghost', '>=22.19.0')]);
    assert.ok(failures.some((failure) => /@pagopa\/ghost is not reachable/u.test(failure)));
  });
});
