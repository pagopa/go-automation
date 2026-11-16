import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { InstalledNode } from './types/InstalledNode.js';

/**
 * The dependency graph of an installed consumer project, read lazily from the `package.json` files.
 * Dependencies are found with Node's lookup: in the `node_modules` of the package's real directory and
 * of each ancestor. This works for the npm hoisted layout and for the pnpm isolated one, where a
 * package's dependencies are siblings in `.pnpm/<id>/node_modules`.
 */
export class InstalledGraph {
  private readonly nodes = new Map<string, InstalledNode>();

  /**
   * Real directory of `name` as Node resolves it from `fromDirectory`.
   *
   * @param fromDirectory - Directory of the importing package (or of the consumer project)
   * @param name - Package name
   * @returns The real directory, or `undefined` when the package is not installed
   */
  public async resolve(fromDirectory: string, name: string): Promise<string | undefined> {
    for (let folder = fromDirectory; ; folder = path.dirname(folder)) {
      const real = await safeRealpath(path.join(folder, 'node_modules', name));
      if (real !== undefined && (await readJson(path.join(real, 'package.json'))) !== undefined) return real;
      if (path.dirname(folder) === folder) return undefined;
    }
  }

  /**
   * The package at `start` and every installed package it reaches through dependencies, optional
   * dependencies and installed peers. A dependency that is not installed (an optional peer) is skipped.
   *
   * @param start - Real directory of the first package
   * @returns The reached packages, `start` included
   */
  public async closure(start: string): Promise<ReadonlyArray<InstalledNode>> {
    const visited = new Map<string, InstalledNode>();
    const pending = [start];
    for (let directory = pending.pop(); directory !== undefined; directory = pending.pop()) {
      if (visited.has(directory)) continue;
      const node = await this.read(directory);
      if (node === undefined) continue;
      visited.set(directory, node);
      for (const dependency of node.dependencies) {
        const resolved = await this.resolve(directory, dependency);
        if (resolved !== undefined) pending.push(resolved);
      }
    }
    return [...visited.values()];
  }

  private async read(directory: string): Promise<InstalledNode | undefined> {
    const cached = this.nodes.get(directory);
    if (cached !== undefined) return cached;
    const manifest = await readJson(path.join(directory, 'package.json'));
    const name = manifest?.['name'];
    if (manifest === undefined || typeof name !== 'string') return undefined;
    const engines = manifest['engines'];
    const range =
      typeof engines === 'object' && engines !== null
        ? (engines as Readonly<Record<string, unknown>>)['node']
        : undefined;
    const dependencies = ['dependencies', 'optionalDependencies', 'peerDependencies'].flatMap((field) => {
      const value = manifest[field];
      return typeof value === 'object' && value !== null ? Object.keys(value) : [];
    });
    const node: InstalledNode = {
      directory,
      name,
      id: `${name}@${String(manifest['version'])}`,
      ...(typeof range === 'string' ? { range } : {}),
      dependencies: [...new Set(dependencies)],
    };
    this.nodes.set(directory, node);
    return node;
  }
}

async function safeRealpath(candidate: string): Promise<string | undefined> {
  try {
    return await fs.realpath(candidate);
  } catch {
    return undefined;
  }
}

async function readJson(file: string): Promise<Readonly<Record<string, unknown>> | undefined> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Readonly<Record<string, unknown>>) : undefined;
  } catch {
    return undefined;
  }
}
