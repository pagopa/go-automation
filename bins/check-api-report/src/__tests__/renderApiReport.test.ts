import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';
import ts from 'typescript';

import { reportName } from '../listEntrypoints.js';
import { probeValueExports } from '../probeValueExports.js';
import { exportedNames, finalizeReports, renderApiReport } from '../renderApiReport.js';

describe('API report', () => {
  let directory = '';
  let report = '';

  before(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'api-report-test-'));
    const dist = path.join(directory, 'dist');
    await fs.mkdir(path.join(dist, 'family'), { recursive: true });
    await fs.writeFile(
      path.join(dist, 'Hidden.d.ts'),
      "import type { Deep } from './Deep.js';\nexport interface Hidden { readonly value: number; readonly deep: Deep; }\n",
    );
    await fs.writeFile(path.join(dist, 'Deep.d.ts'), 'export interface Deep { readonly flag?: boolean; }\n');
    await fs.writeFile(path.join(dist, 'Service.d.ts'), 'export declare class Service { run(): void; }\n');
    await fs.writeFile(path.join(dist, 'StarTyped.d.ts'), 'export declare class StarTyped { }\n');
    await fs.writeFile(path.join(dist, 'StarValued.d.ts'), 'export declare class StarValued { }\n');
    await fs.writeFile(path.join(dist, 'package.json'), '{ "type": "module" }\n');
    await fs.writeFile(path.join(dist, 'family', 'index.d.ts'), 'export declare function familyHelper(): string;\n');
    await fs.writeFile(
      path.join(dist, 'index.d.ts'),
      [
        "import type { Hidden } from './Hidden.js';",
        '/** Comments are not part of the report. */',
        'export interface Visible { readonly hidden: Hidden; readonly name: string; }',
        'export declare const answer: number;',
        "export * as family from './family/index.js';",
        "export type * as familyTypes from './family/index.js';",
        "export { Service } from './Service.js';",
        "export type { Service as ServiceType } from './Service.js';",
        "export type * from './StarTyped.js';",
        "export * from './StarValued.js';",
        '',
      ].join('\n'),
    );
    const typesFile = path.join(dist, 'index.d.ts');
    const options = {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      // The fixture uses only primitive types: skipping the default libraries keeps the program small.
      noLib: true,
      types: [],
    };
    const program = ts.createProgram([typesFile], options);
    const entrypoint = { packageName: '@pagopa/demo', packageDirectory: directory, subpath: '.', typesFile };
    const [values] = probeValueExports([{ typesFile, names: exportedNames(entrypoint, program) }], options);
    const rendered = renderApiReport(entrypoint, program, values ?? new Set<string>());
    report = finalizeReports([rendered]).get('index.api.md') ?? '';
  });

  after(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('lists every export sorted by name, without comments, expanding namespaces', () => {
    assert.ok(report.startsWith('# API report: `@pagopa/demo`'));
    assert.ok(report.indexOf('### `Visible`') > report.indexOf('### `answer`'));
    assert.match(report, /const answer: number;/u);
    assert.match(report, /## namespace `family` \(value\)\n\n### `family.familyHelper`/u);
    assert.doesNotMatch(report, /Comments are not part/u);
  });

  it('records whether each export is a runtime value or a type only', () => {
    assert.match(report, /### `Service` \(value\)/u);
    assert.match(report, /### `ServiceType` \(type\)/u);
    assert.match(report, /### `answer` \(value\)/u);
    assert.match(report, /### `Visible` \(type\)/u);
    // `export type * from` removes the runtime export; `export * from` keeps it.
    assert.match(report, /### `StarTyped` \(type\)/u);
    assert.match(report, /### `StarValued` \(value\)/u);
    // A namespace re-exported with `export type * as` is type-only, and so is everything under it.
    assert.match(report, /## namespace `family` \(value\)\n\n### `family.familyHelper` \(value\)/u);
    assert.match(report, /## namespace `familyTypes` \(type\)\n\n### `familyTypes.familyHelper` \(type\)/u);
  });

  it('prints the shape of the package types no entrypoint exports, transitively', () => {
    assert.match(report, /## Referenced but not exported[\s\S]*### `Hidden` \(dist\/Hidden\.d\.ts\)/u);
    assert.match(report, /readonly value: number;/u);
    // Reached only through Hidden: a change to its optional property must change the report.
    assert.match(report, /### `Deep` \(dist\/Deep\.d\.ts\)[\s\S]*readonly flag\?: boolean;/u);
  });

  it('names the report files after the subpath', () => {
    assert.strictEqual(reportName('.'), 'index');
    assert.strictEqual(reportName('./cloudwatch-logs/insights'), 'cloudwatch-logs-insights');
  });
});
