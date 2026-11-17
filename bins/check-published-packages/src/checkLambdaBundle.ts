import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

/** Modules the pilot bundle must never contain. */
const FORBIDDEN_MODULES: ReadonlyArray<RegExp> = [
  /\/@aws-sdk\/client-ec2\//u,
  /\/@inquirer\//u,
  /\/better-sqlite3\//u,
  /\/@slack\//u,
  /\/mailparser\//u,
  /\/mammoth\//u,
  /\/@go-automation\/go-(script|send)\//u,
  /\.node$/u,
];

/** RSS ceiling after importing the bundle and listing the catalog: half of the 512 MiB Lambda. */
const MAX_RSS_BYTES = 256 * 1024 * 1024;

/** The minimal pilot handler of §7.7: the imports the go-watchtower Lambda will use. */
const HANDLER_SOURCE = `
import { AWSActiveOperationRegistry } from '@pagopa/go-aws';
import { AWSProvider } from '@pagopa/go-aws/all';
import { GOHttpClient } from '@pagopa/go-common/http';
import { NOOP_RUNBOOK_REPORTER } from '@pagopa/go-runbook';
import { classifyRunbookOutcome } from '@pagopa/go-runbook/output';
import { RUNBOOK_CATALOG } from '@pagopa/go-runbook/inventory';
import {
  bindServicesToOccurrence,
  createAwsAccountsPort,
  createServiceRegistry,
  executeRunbookForOccurrence,
  toAwsAccountsConfig,
} from '@pagopa/go-runbook/runtime';

export const pilot = { classifyRunbookOutcome, executeRunbookForOccurrence };

export async function handler() {
  const aws = new AWSProvider({ region: 'eu-south-1' });
  const registry = createServiceRegistry({ services: aws.services, http: new GOHttpClient({}) }, NOOP_RUNBOOK_REPORTER);
  const awsAccounts = createAwsAccountsPort(
    toAwsAccountsConfig({ directory: [], region: 'eu-south-1', defaultBinding: 'oam' }),
    { monitoring: aws.services.cloudWatchLogs },
  );
  const activeOperations = new AWSActiveOperationRegistry();
  try {
    bindServicesToOccurrence({ ...registry, awsAccounts }, {
      target: { accountId: '000000000000', region: 'eu-south-1' },
      activeOperations,
      mode: 'oam-target',
    });
    return RUNBOOK_CATALOG.listDescriptors().length;
  } finally {
    await activeOperations.stopAll();
  }
}
`;

/** Facts about the S8 bundle. */
export interface LambdaBundleReport {
  readonly failures: ReadonlyArray<string>;
  readonly notes: ReadonlyArray<string>;
}

/**
 * S8: bundles the pilot handler as `NodejsFunction` would (esbuild, ESM, `node24`, `platform: node`),
 * asserts the absence of forbidden and native modules, then imports the bundle, lists the catalog
 * and checks the RSS.
 *
 * @param directory - Consumer project with the S7 installation
 * @returns Failures and notes (bundle size, runbooks, RSS)
 */
export async function checkLambdaBundle(directory: string): Promise<LambdaBundleReport> {
  const outfile = path.join(directory, 'bundle.mjs');
  const result = await build({
    stdin: { contents: HANDLER_SOURCE, resolveDir: directory, loader: 'js', sourcefile: 'handler.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    outfile,
    metafile: true,
    logLevel: 'error',
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
    },
  });
  const inputs = Object.keys(result.metafile.inputs);
  const failures = inputs
    .filter((input) => FORBIDDEN_MODULES.some((pattern) => pattern.test(input)))
    .map((input) => `S8 bundle contains a forbidden module: ${input}`);
  const size = (await fs.stat(outfile)).size;
  const probe = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify(pathToFileURL(outfile).href)}); const runbooks = await m.handler(); console.log(JSON.stringify({ runbooks, rss: process.memoryUsage().rss }));`,
    ],
    { cwd: directory, encoding: 'utf8' },
  );
  if (probe.status !== 0) {
    return { failures: [...failures, `S8 bundle failed to run: ${probe.stderr.trim().slice(0, 300)}`], notes: [] };
  }
  const measured = JSON.parse(probe.stdout.trim().split('\n').pop() ?? '{}') as { runbooks?: number; rss?: number };
  const rss = measured.rss ?? Number.POSITIVE_INFINITY;
  if (rss >= MAX_RSS_BYTES) failures.push(`S8 RSS ${megabytes(rss)} MB is not below ${megabytes(MAX_RSS_BYTES)} MB`);
  if ((measured.runbooks ?? 0) === 0) failures.push('S8 bundle listed no runbook');
  return {
    failures,
    notes: [
      `bundle ${String(Math.round(size / 1024))} KB`,
      `runbooks ${String(measured.runbooks)}`,
      `RSS ${megabytes(rss)} MB`,
    ],
  };
}

function megabytes(bytes: number): string {
  return String(Math.round(bytes / (1024 * 1024)));
}
