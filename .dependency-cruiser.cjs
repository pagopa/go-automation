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
  (workspace) => workspace.directory !== 'packages/go-common' && packageName(workspace) !== '@go-automation/go-common',
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
 * go-common internal layering (EVO-PKGPUB-OPUS-01 §7.1.2, Fase 1).
 *
 * Kernel areas are ordered by level: an area may import only areas of the same or a lower level.
 * Areas destined to leave go-common (go-script, go-aws, go-documents, go-slack) must never be
 * imported by the kernel, so that Phase 2 can extract them without cutting any kernel edge.
 */
const GO_COMMON_CORE = '^packages/go-common/src/libs/core/';
const GO_COMMON_KERNEL_LEVELS = [
  ['utils', 'security', 'json', 'events'],
  ['errors', 'analysis'],
  ['dates', 'polling'],
  ['concurrency', 'process', 'files', 'parsers', 'render'],
  ['importers', 'exporters', 'http'],
  ['logging'],
];
const GO_COMMON_LEAVING_AREAS = {
  'go-script': ['config', 'environment', 'prompt', 'script', 'paths'],
  'go-documents': ['text', 'storage'],
  'go-slack': ['messaging'],
};

function goCommonAreaPattern(areas) {
  return `${GO_COMMON_CORE}(?:${areas.join('|')})/`;
}

function goCommonLayerRules() {
  const kernelAreas = GO_COMMON_KERNEL_LEVELS.flat();
  const scriptAreas = GO_COMMON_LEAVING_AREAS['go-script'];
  const extractedLeafAreas = [...GO_COMMON_LEAVING_AREAS['go-documents'], ...GO_COMMON_LEAVING_AREAS['go-slack']];
  const levelRules = GO_COMMON_KERNEL_LEVELS.slice(0, -1).map((areas, level) => ({
    name: `go-common-kernel-level-${level}`,
    severity: 'error',
    comment: `go-common kernel level ${level} (${areas.join(', ')}) must not import higher kernel levels.`,
    from: { path: goCommonAreaPattern(areas) },
    to: { path: goCommonAreaPattern(GO_COMMON_KERNEL_LEVELS.slice(level + 1).flat()) },
  }));
  return [
    ...levelRules,
    {
      name: 'go-common-kernel-not-on-leaving-areas',
      severity: 'error',
      comment:
        'The go-common kernel must not import areas that will leave go-common (go-script, go-aws, go-documents, go-slack).',
      from: { path: goCommonAreaPattern(kernelAreas) },
      to: {
        path: [goCommonAreaPattern([...scriptAreas, ...extractedLeafAreas]), '^packages/go-common/src/libs/aws/'],
      },
    },
    {
      name: 'go-common-aws-not-on-script-or-leaf-areas',
      severity: 'error',
      comment: 'The future go-aws must depend only on the kernel, never on go-script, go-documents or go-slack areas.',
      from: { path: '^packages/go-common/src/libs/aws/' },
      to: { path: goCommonAreaPattern([...scriptAreas, ...extractedLeafAreas]) },
    },
    {
      name: 'go-common-leaf-areas-only-on-kernel',
      severity: 'error',
      comment: 'go-documents and go-slack areas must not depend on go-script or go-aws areas.',
      from: { path: goCommonAreaPattern(extractedLeafAreas) },
      to: { path: [goCommonAreaPattern(scriptAreas), '^packages/go-common/src/libs/aws/'] },
    },
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
    ...goCommonLayerRules(),
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
        path: [
          '^async_hooks$',
          '^constants$',
          '^domain$',
          '^punycode$',
          '^sys$',
          '^_linklist$',
          '^_stream_wrap$',
        ],
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
