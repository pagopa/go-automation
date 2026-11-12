const fs = require('node:fs');
const path = require('node:path');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasPackageJson(directory) {
  return fs.existsSync(path.join(__dirname, directory, 'package.json'));
}

function hasSourceDirectory(directory) {
  return fs.existsSync(path.join(__dirname, directory, 'src'));
}

function readPackageJson(directory) {
  const packagePath = path.join(__dirname, directory, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return undefined;
  }
  return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
}

function listWorkspaceDirectories(root, { requirePackageJson = true } = {}) {
  const absoluteRoot = path.join(__dirname, root);
  if (!fs.existsSync(absoluteRoot)) {
    return [];
  }

  return fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.posix.join(root, entry.name))
    .filter((directory) => (requirePackageJson ? hasPackageJson(directory) : hasSourceDirectory(directory)))
    .sort();
}

function listWorkspaces(root, options = {}) {
  return listWorkspaceDirectories(root, options).map((directory) => ({
    directory,
    packageJson: readPackageJson(directory),
  }));
}

function packageImportPattern(packageName) {
  return `^${escapeRegExp(packageName)}(?:/|$)`;
}

function compact(values) {
  return values.filter((value) => value !== undefined && value !== '');
}

function packageName(workspace) {
  return typeof workspace.packageJson?.name === 'string' ? workspace.packageJson.name : undefined;
}

function dependencyNames(workspace) {
  return new Set([
    ...Object.keys(workspace.packageJson?.dependencies ?? {}),
    ...Object.keys(workspace.packageJson?.peerDependencies ?? {}),
    ...Object.keys(workspace.packageJson?.optionalDependencies ?? {}),
    ...Object.keys(workspace.packageJson?.devDependencies ?? {}),
  ]);
}

const packageWorkspaces = listWorkspaces('packages');
const nonCommonPackageWorkspaces = packageWorkspaces.filter(
  (workspace) => workspace.directory !== 'packages/go-common' && packageName(workspace) !== '@pagopa/go-common',
);
const scriptWorkspaces = [
  ...listWorkspaces('scripts/aws'),
  ...listWorkspaces('scripts/go'),
  ...listWorkspaces('scripts/send'),
];
const functionWorkspaces = listWorkspaces('functions');
const binWorkspaces = listWorkspaces('bins', { requirePackageJson: false });

const workspacePackageNames = compact(
  [...packageWorkspaces, ...scriptWorkspaces, ...functionWorkspaces].map(packageName),
);
const workspacePackageImportPatterns = workspacePackageNames.map(packageImportPattern);
const binPathPatterns = binWorkspaces.map((workspace) => `^${escapeRegExp(workspace.directory)}/`);

function workspaceDependencyPatterns(workspaces) {
  return [
    ...workspaces.map((workspace) => `^${escapeRegExp(workspace.directory)}/`),
    ...compact(workspaces.map(packageName)).map(packageImportPattern),
  ];
}

const nonCommonPackageDependencyPatterns = workspaceDependencyPatterns(nonCommonPackageWorkspaces);
const scriptDependencyPatterns = workspaceDependencyPatterns(scriptWorkspaces);
const functionDependencyPatterns = workspaceDependencyPatterns(functionWorkspaces);
const binDependencyPatterns = binPathPatterns;
const appDependencyPatterns = [...scriptDependencyPatterns, ...functionDependencyPatterns, ...binDependencyPatterns];

function workspaceRules(root, name, options = {}) {
  const workspaces = listWorkspaces(root, options);
  const rootDependencyPatterns = workspaceDependencyPatterns(workspaces);

  return workspaces.map((workspace) => ({
    name: `${name}:${workspace.directory}`,
    severity: 'error',
    from: {
      path: `^${escapeRegExp(workspace.directory)}/`,
    },
    to: {
      path: rootDependencyPatterns,
      pathNot: [
        `^${escapeRegExp(workspace.directory)}/`,
        ...compact([packageName(workspace)]).map(packageImportPattern),
        ...workspaceDependencyPatterns(
          workspaces.filter((candidate) => {
            const name = packageName(candidate);
            return name !== undefined && dependencyNames(workspace).has(name);
          }),
        ),
      ],
    },
  }));
}

function functionScriptBoundaryRules() {
  return functionWorkspaces.map((workspace) => {
    const dependencies = dependencyNames(workspace);
    const allowedScripts = scriptWorkspaces.filter((script) => {
      const name = packageName(script);
      return name !== undefined && dependencies.has(name);
    });

    return {
      name: `functions-use-declared-script:${workspace.directory}`,
      severity: 'error',
      comment: 'A lambda wrapper may import only the script package it declares as a dependency.',
      from: {
        path: `^${escapeRegExp(workspace.directory)}/`,
      },
      to: {
        path: scriptDependencyPatterns,
        pathNot: workspaceDependencyPatterns(allowedScripts),
      },
    };
  });
}

const workspaceBoundaryRules = [
  ...workspaceRules('scripts/aws', 'aws-scripts-no-cross-import'),
  ...workspaceRules('scripts/go', 'go-scripts-no-cross-import'),
  ...workspaceRules('scripts/send', 'send-scripts-no-cross-import'),
  ...workspaceRules('functions', 'functions-no-cross-import'),
  ...workspaceRules('bins', 'bins-no-cross-import', { requirePackageJson: false }),
  ...functionScriptBoundaryRules(),
];

/**
 * Package layering of the published family (EVO-PKGPUB-OPUS-01 §6.1, §7.1.2, §7.2.1, §10.5).
 *
 * - go-common kernel areas are ordered by level: an area may import only areas of the same or a lower level.
 * - go-aws never imports packages above it; each service subpath imports only its own SDK clients.
 * - A published package never depends on a private one.
 * - go-runbook never uses EC2 (D5).
 *
 * Cross-package edges are matched on the import specifier (workspace packages are not resolved yet: K8).
 */
const GO_COMMON_SRC = '^packages/go-common/src/';
const GO_COMMON_KERNEL_LEVELS = [
  ['utils', 'security', 'json', 'events'],
  ['errors', 'analysis'],
  ['dates', 'polling'],
  ['concurrency', 'process', 'files', 'parsers', 'render'],
  ['importers', 'exporters', 'http'],
  ['logging'],
];
/** Allowed `@aws-sdk/client-*` packages per go-aws source folder ('' = core files at the package root). */
const GO_AWS_ALLOWED_CLIENTS = {
  '': ['sts'],
  s3: ['s3'],
  sqs: ['sqs', 'cloudwatch'],
  dynamodb: ['dynamodb'],
  athena: ['athena'],
  'cloudwatch-logs': ['cloudwatch-logs'],
  'cloudwatch-logs/insights': [],
  'cloudwatch-metrics': ['cloudwatch'],
  'cloudwatch-alarms': ['cloudwatch'],
  ecs: ['ecs'],
  lambda: ['lambda'],
  scheduler: ['scheduler'],
  'secrets-manager': ['secrets-manager'],
  ssm: ['ssm'],
  ec2: ['ec2'],
};

function goCommonAreaPattern(areas) {
  return `${GO_COMMON_SRC}(?:${areas.join('|')})/`;
}

function packageReferencePatterns(names) {
  return names.flatMap((name) => [packageImportPattern(name), `^packages/${escapeRegExp(name.split('/')[1])}/`]);
}

function goAwsFolderPattern(folder) {
  if (folder === '') return '^packages/go-aws/src/[^/]+$';
  // Production sources only: tests may use any SDK to build fixtures or check type compatibility.
  return `^packages/go-aws/src/${escapeRegExp(folder)}/(?:[^/]+|models/.+)$`;
}

function packageLayerRules() {
  const kernelLevelRules = GO_COMMON_KERNEL_LEVELS.slice(0, -1).map((areas, level) => ({
    name: `go-common-kernel-level-${level}`,
    severity: 'error',
    comment: `go-common kernel level ${level} (${areas.join(', ')}) must not import higher kernel levels.`,
    from: { path: goCommonAreaPattern(areas) },
    to: { path: goCommonAreaPattern(GO_COMMON_KERNEL_LEVELS.slice(level + 1).flat()) },
  }));
  // The scope says whether a package is published: @pagopa/* is published, everything else is private.
  const publishedNames = compact(packageWorkspaces.map(packageName)).filter((name) => name.startsWith('@pagopa/'));
  const privateNames = compact(packageWorkspaces.map(packageName)).filter((name) => !name.startsWith('@pagopa/'));
  const awsIsolationRules = Object.entries(GO_AWS_ALLOWED_CLIENTS).map(([folder, clients]) => ({
    name: `go-aws-service-isolation:${folder === '' ? 'core' : folder}`,
    severity: 'error',
    comment: `go-aws ${folder === '' ? 'core' : `./${folder}`} may import only these SDK clients: ${clients.join(', ') || 'none'}.`,
    from: { path: goAwsFolderPattern(folder) },
    to: {
      path: '@aws-sdk/client-',
      ...(clients.length > 0 ? { pathNot: `@aws-sdk/client-(?:${clients.map(escapeRegExp).join('|')})(?:/|$)` } : {}),
    },
  }));
  return [
    ...kernelLevelRules,
    {
      name: 'go-aws-no-upward',
      severity: 'error',
      comment:
        'go-aws sits on go-common only: it never imports go-script, go-send, go-runbook or other packages above it.',
      from: { path: '^packages/go-aws/' },
      to: {
        path: packageReferencePatterns(
          compact(packageWorkspaces.map(packageName)).filter(
            (name) => !['@pagopa/go-common', '@pagopa/go-aws'].includes(name),
          ),
        ),
      },
    },
    {
      name: 'published-not-on-private',
      severity: 'error',
      comment: 'A published package (@pagopa/*) never depends on a private workspace package (@go-automation/*).',
      from: { path: publishedNames.map((name) => `^packages/${escapeRegExp(name.split('/')[1])}/`) },
      to: { path: packageReferencePatterns(privateNames) },
    },
    {
      name: 'runbook-not-on-ec2',
      severity: 'error',
      comment: 'D5: go-runbook (engine, inventory, runtime) never uses EC2.',
      from: { path: '^packages/go-runbook/' },
      to: { path: ['@aws-sdk/client-ec2(?:/|$)', '^@pagopa/go-aws/ec2$', '^packages/go-aws/src/ec2/'] },
    },
    ...awsIsolationRules,
  ];
}

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Avoid import cycles: they make initialization order and tests harder to reason about.',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Every import must resolve from the checked workspace.',
      from: {},
      to: {
        couldNotResolve: true,
        dynamic: false,
        pathNot: workspacePackageImportPatterns,
      },
    },
    {
      name: 'not-to-test',
      severity: 'error',
      comment: 'Production code must not import unit tests or test fixtures.',
      from: {
        pathNot: '[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$',
      },
      to: {
        path: '[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$',
      },
    },
    {
      name: 'common-is-foundation',
      severity: 'error',
      comment: 'go-common is the bottom layer: it must not depend on packages, scripts, functions or bins.',
      from: {
        path: '^packages/go-common/',
      },
      to: {
        path: [...nonCommonPackageDependencyPatterns, ...appDependencyPatterns],
      },
    },
    ...packageLayerRules(),
    {
      name: 'packages-do-not-import-apps',
      severity: 'error',
      comment: 'Shared packages must not depend on executable scripts, functions or tooling bins.',
      from: {
        path: '^packages/',
      },
      to: {
        path: appDependencyPatterns,
      },
    },
    {
      name: 'scripts-do-not-import-functions-or-bins',
      severity: 'error',
      comment: 'Scripts may use shared packages, but must not depend on deployable functions or bins.',
      from: {
        path: '^scripts/',
      },
      to: {
        path: [...functionDependencyPatterns, ...binDependencyPatterns],
      },
    },
    {
      name: 'functions-do-not-import-bins',
      severity: 'error',
      comment: 'Functions must not depend on repository tooling bins.',
      from: {
        path: '^functions/',
      },
      to: {
        path: binDependencyPatterns,
      },
    },
    {
      name: 'bins-do-not-import-apps',
      severity: 'error',
      comment: 'Repository tooling can use packages, but must not depend on runtime scripts or functions.',
      from: {
        path: '^bins/',
      },
      to: {
        path: [...scriptDependencyPatterns, ...functionDependencyPatterns],
      },
    },
    {
      name: 'not-to-deprecated-core',
      severity: 'warn',
      from: {},
      to: {
        dependencyTypes: ['core'],
        path: ['^async_hooks$', '^constants$', '^domain$', '^punycode$', '^sys$', '^_linklist$', '^_stream_wrap$'],
      },
    },
    {
      name: 'not-to-deprecated',
      severity: 'warn',
      from: {},
      to: {
        dependencyTypes: ['deprecated'],
      },
    },
    ...workspaceBoundaryRules,
  ],

  options: {
    combinedDependencies: true,
    doNotFollow: {
      path: ['^node_modules/'],
    },
    exclude: {
      path: [
        '(^|/)(?:dist|coverage|artifacts|outputs?)(/|$)',
        '(^|/)\\.turbo(/|$)',
        '(^|/)\\.next(/|$)',
        '(^|/)\\.cache(/|$)',
        '[.]tsbuildinfo$',
      ],
    },
    moduleSystems: ['es6', 'cjs'],
    preserveSymlinks: false,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    tsPreCompilationDeps: true,
  },
};
