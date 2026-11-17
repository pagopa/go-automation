import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { GitCli } from './adapters/GitCli.js';
import { GitHubRestClient } from './adapters/GitHubRestClient.js';
import { NpmRegistryCli } from './adapters/NpmRegistryCli.js';
import { runCommand } from './adapters/runCommand.js';
import { auditReleases } from './auditReleases.js';
import { eventString } from './githubEvent.js';
import {
  checkChangesetCoverage,
  checkContribution,
  checkPromotion,
  checkReleasePerimeter,
  pendingChangesets,
} from './pullRequestGuards.js';
import { reproduceRelease } from './reproduceRelease.js';
import { versionNeeded } from './versionNeeded.js';
import type { ReleaseContext } from './types/ReleaseContext.js';

const USAGE = `Usage: check-release-state <command> [--base <sha>] [--head <sha>]

Release workflow:
  version-needed      whether develop HEAD has changesets to version → GITHUB_OUTPUT needed=true|false
  audit               every merged release PR is published, tagged, with aligned channels (read only)

Pull request guards (§10.3), run from the trusted base checkout; the head is read as data.
base/head from the event or --base/--head:
  contribution-guard  a changeset names every changed published package; no hand-made release metadata
  release-pr-guard    perimeter + audit + reproduction of changeset version on the base
  promotion-guard     every version comes from a validated release + audit`;

function optionValue(argv: ReadonlyArray<string>, option: string): string | undefined {
  const index = argv.indexOf(option);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set`);
  return value;
}

async function readEvent(): Promise<unknown> {
  return JSON.parse(await fs.readFile(requiredEnv('GITHUB_EVENT_PATH'), 'utf8')) as unknown;
}

/** Base and head of the pull request: `--base`/`--head`, or the event payload. */
async function pullRequestRange(argv: ReadonlyArray<string>): Promise<readonly [string, string]> {
  const base = optionValue(argv, '--base');
  const head = optionValue(argv, '--head');
  if (base !== undefined && head !== undefined) return [base, head];
  const event = await readEvent();
  return [eventString(event, 'pull_request', 'base', 'sha'), eventString(event, 'pull_request', 'head', 'sha')];
}

async function appendFile(variable: string, text: string): Promise<void> {
  const file = process.env[variable];
  if (file !== undefined && file !== '') await fs.appendFile(file, text);
}

/** Prints the problems of a check and returns its exit code. */
function report(title: string, problems: ReadonlyArray<string>): number {
  if (problems.length === 0) {
    console.log(`${title}: ok`);
    return 0;
  }
  console.error(`${title}: ${String(problems.length)} problem(s)`);
  for (const problem of problems) console.error(`- ${problem}`);
  return 1;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const root = process.cwd();
  const repository = process.env['GITHUB_REPOSITORY'] ?? '';
  const context: ReleaseContext = {
    git: new GitCli(runCommand, root),
    registry: new NpmRegistryCli(runCommand, root),
    github: new GitHubRestClient(
      async (url, init) => fetch(url, init),
      repository,
      process.env['GITHUB_TOKEN'] ?? process.env['GH_TOKEN'] ?? '',
      process.env['GITHUB_API_URL'] ?? 'https://api.github.com',
    ),
  };

  switch (command) {
    case 'version-needed': {
      const needed = versionNeeded(context.git, context.git.head());
      await appendFile('GITHUB_OUTPUT', `needed=${String(needed)}\n`);
      console.log(needed ? 'Changesets to version: the release PR is created or updated.' : 'Nothing to version.');
      return 0;
    }
    case 'audit':
      return report('Release audit', await auditReleases(context));
    case 'contribution-guard': {
      const [base, head] = await pullRequestRange(argv);
      return Math.max(
        report('Changesets cover the changed published packages', checkChangesetCoverage(context.git, base, head)),
        report('No hand-made release metadata', checkContribution(context.git, base, head)),
      );
    }
    case 'release-pr-guard': {
      const [base, head] = await pullRequestRange(argv);
      const perimeter = checkReleasePerimeter(context.git, base, head);
      const audit = await auditReleases(context);
      const workDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'release-pr-guard-'));
      try {
        const reproduction = await reproduceRelease(context.git, runCommand, {
          repositoryRoot: root,
          base,
          head,
          workDirectory,
        });
        return Math.max(
          report('Release perimeter', perimeter),
          report('Previous releases complete (audit)', audit),
          report('Reproducible with changeset version', reproduction),
        );
      } finally {
        await fs.rm(workDirectory, { recursive: true, force: true });
      }
    }
    case 'promotion-guard': {
      const [base, head] = await pullRequestRange(argv);
      const pending = pendingChangesets(context.git, head);
      await appendFile(
        'GITHUB_STEP_SUMMARY',
        `### Changesets not yet released\n\n${pending.length === 0 ? 'None.' : pending.map((name) => `- \`${name}\``).join('\n')}\n`,
      );
      console.log(`Changesets not yet released: ${pending.length === 0 ? 'none' : pending.join(', ')}`);
      return Math.max(
        report('Promotion versions', checkPromotion(context.git, base, head)),
        report('Previous releases complete (audit)', await auditReleases(context)),
      );
    }
    default:
      console.error(USAGE);
      return 2;
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  },
);
