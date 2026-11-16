import type { SmokeScenario } from './types/SmokeScenario.js';

const GO_COMMON = '@pagopa/go-common';
const GO_AWS = '@pagopa/go-aws';
const GO_RUNBOOK = '@pagopa/go-runbook';

/** The peers of `@pagopa/go-aws/all`: every SDK client of the table except EC2 (D5). */
const ALL_PEERS_WITHOUT_EC2: ReadonlyArray<string> = [
  '@aws-sdk/client-athena',
  '@aws-sdk/client-cloudwatch',
  '@aws-sdk/client-cloudwatch-logs',
  '@aws-sdk/client-dynamodb',
  '@aws-sdk/client-ecs',
  '@aws-sdk/client-lambda',
  '@aws-sdk/client-s3',
  '@aws-sdk/client-scheduler',
  '@aws-sdk/client-secrets-manager',
  '@aws-sdk/client-sqs',
  '@aws-sdk/client-ssm',
  '@aws-sdk/util-dynamodb',
];

/**
 * SDK peers required by each `@pagopa/go-aws` subpath: the table of EVO-PKGPUB-OPUS-01 §7.2.1,
 * the source of truth for the S4 scenarios. A subpath missing here fails `assertScenarioCoverage`.
 */
export const GO_AWS_SUBPATH_PEERS: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ['.', []],
  ['./s3', ['@aws-sdk/client-s3']],
  ['./sqs', ['@aws-sdk/client-sqs', '@aws-sdk/client-cloudwatch']],
  ['./dynamodb', ['@aws-sdk/client-dynamodb', '@aws-sdk/util-dynamodb']],
  ['./athena', ['@aws-sdk/client-athena']],
  ['./cloudwatch-logs', ['@aws-sdk/client-cloudwatch-logs']],
  ['./cloudwatch-logs/insights', []],
  ['./profiles', []],
  ['./cloudwatch-metrics', ['@aws-sdk/client-cloudwatch']],
  ['./cloudwatch-alarms', ['@aws-sdk/client-cloudwatch']],
  ['./ecs', ['@aws-sdk/client-ecs']],
  ['./lambda', ['@aws-sdk/client-lambda']],
  ['./scheduler', ['@aws-sdk/client-scheduler']],
  ['./secrets-manager', ['@aws-sdk/client-secrets-manager']],
  ['./ssm', ['@aws-sdk/client-ssm']],
  ['./ec2', ['@aws-sdk/client-ec2']],
  ['./all', ALL_PEERS_WITHOUT_EC2],
]);

/** go-runbook subpaths that load no AWS SDK (S6); only `./runtime` does. */
const RUNBOOK_SDK_FREE: ReadonlyArray<string> = [
  '.',
  './output',
  './toolkits/common',
  './toolkits/send',
  './toolkits/interop',
  './inventory',
];

/**
 * Builds the mandatory scenarios of EVO-PKGPUB-OPUS-01 §10.2 (amendment r14).
 *
 * @param goCommonSubpaths - Export subpaths of `@pagopa/go-common` (from its manifest)
 * @param goRunbookSubpaths - Export subpaths of `@pagopa/go-runbook` (from its manifest)
 * @returns S1, one S4 per go-aws subpath, S6, S7 and S8
 */
export function buildScenarios(
  goCommonSubpaths: ReadonlyArray<string>,
  goRunbookSubpaths: ReadonlyArray<string>,
): ReadonlyArray<SmokeScenario> {
  const goAwsScenarios = [...GO_AWS_SUBPATH_PEERS].map(([subpath, peers]): SmokeScenario => ({
    id: `S4-${subpath === '.' ? 'root' : subpath.slice(2).replaceAll('/', '-')}`,
    description: `go-aws ${subpath} with only its peers`,
    packages: [GO_AWS],
    peers,
    imports: [specifier(GO_AWS, subpath)],
  }));
  return [
    {
      id: 'S1',
      description: 'go-common alone',
      packages: [GO_COMMON],
      peers: [],
      imports: goCommonSubpaths.map((subpath) => specifier(GO_COMMON, subpath)),
    },
    ...goAwsScenarios,
    {
      id: 'S6',
      description: 'go-runbook without any AWS SDK',
      packages: [GO_RUNBOOK],
      peers: [],
      imports: RUNBOOK_SDK_FREE.map((subpath) => specifier(GO_RUNBOOK, subpath)),
    },
    {
      id: 'S7',
      description: 'go-runbook complete, with the peers of go-aws/all',
      packages: [GO_RUNBOOK],
      peers: ALL_PEERS_WITHOUT_EC2,
      imports: goRunbookSubpaths.map((subpath) => specifier(GO_RUNBOOK, subpath)),
    },
    {
      id: 'S8',
      description: 'pilot Lambda bundle (esbuild, node24, ESM)',
      // The pilot handler imports all three directly, as the go-watchtower Lambda will (§7.7).
      packages: [GO_RUNBOOK, GO_AWS, GO_COMMON],
      peers: ALL_PEERS_WITHOUT_EC2,
      imports: [],
      lambdaBundle: true,
    },
  ];
}

/**
 * Checks that every export subpath of every published package is imported by some scenario,
 * so a new subpath cannot ship untested.
 *
 * @param exportsByPackage - Export subpaths of each published package
 * @param scenarios - The scenarios
 * @returns The specifiers no scenario imports
 */
export function uncoveredSubpaths(
  exportsByPackage: ReadonlyMap<string, ReadonlyArray<string>>,
  scenarios: ReadonlyArray<SmokeScenario>,
): ReadonlyArray<string> {
  const imported = new Set(scenarios.flatMap((scenario) => scenario.imports));
  return [...exportsByPackage].flatMap(([name, subpaths]) =>
    subpaths.map((subpath) => specifier(name, subpath)).filter((spec) => !imported.has(spec)),
  );
}

/**
 * The import specifier of a package subpath.
 *
 * @param name - Package name
 * @param subpath - Export subpath (`.` or `./x`)
 * @returns `name` or `name/x`
 */
export function specifier(name: string, subpath: string): string {
  return subpath === '.' ? name : `${name}/${subpath.slice(2)}`;
}
