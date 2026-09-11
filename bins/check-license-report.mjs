import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
]);

/**
 * Packages admitted despite a license outside ALLOWED_LICENSES.
 *
 * An entry is not a blanket pass. It applies only while the package still
 * declares the exact license recorded here, and only while nothing in the
 * workspace lists it as a runtime dependency — both conditions are checked
 * below, not taken on trust. A relicense upstream, or a move out of
 * devDependencies, closes the exception and the gate fails again.
 *
 * Keep this list short and each reason specific enough to re-evaluate later.
 */
const LICENSE_EXCEPTIONS = new Map([
  [
    'eslint-plugin-sonarjs',
    {
      license: 'LGPL-3.0-only',
      reason:
        'Lint plugin executed as a build-time tool. The LGPL obligations attach to conveying or linking the library; no artifact we publish contains or links it, which the runtime-dependency check enforces.',
    },
  ],
]);

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.sst', 'artifacts']);
const RUNTIME_DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];

/** Every package.json in the workspace, excluding installed and generated trees. */
function* workspaceManifests(directory = REPOSITORY_ROOT) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) yield* workspaceManifests(join(directory, entry.name));
    } else if (entry.name === 'package.json') {
      yield join(directory, entry.name);
    }
  }
}

/**
 * Manifests that would ship the package, i.e. list it anywhere but
 * devDependencies. An exception is only honoured while this is empty.
 */
function runtimeDependents(name) {
  const dependents = [];
  for (const manifestPath of workspaceManifests()) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      continue; // Templates and fixtures are not always valid JSON.
    }

    if (RUNTIME_DEPENDENCY_FIELDS.some((field) => manifest[field]?.[name] !== undefined)) {
      dependents.push(relative(REPOSITORY_ROOT, manifestPath));
    }
  }

  return dependents;
}

/**
 * Decides whether an exception covers this package, and says why when it does
 * not: a silently ignored exception is worse than no exception at all.
 */
function applyException(name, licenses) {
  const exception = LICENSE_EXCEPTIONS.get(name);
  if (exception === undefined) return undefined;

  if (licenses.length !== 1 || licenses[0] !== exception.license) {
    return { applied: false, detail: `expected ${exception.license}, found ${licenses.join(', ') || '<none>'}` };
  }

  const dependents = runtimeDependents(name);
  if (dependents.length > 0) {
    return { applied: false, detail: `declared as a runtime dependency in ${dependents.join(', ')}` };
  }

  return { applied: true, detail: exception.reason };
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
    process.stdin.on('error', reject);
  });
}

function asEntries(value) {
  if (Array.isArray(value)) return value;

  if (typeof value === 'object' && value !== null) {
    for (const candidate of [value.dependencies, value.data, value.packages]) {
      if (Array.isArray(candidate)) return candidate;
    }
  }

  throw new Error('license-report JSON output has an unsupported shape');
}

function tokenizeSpdxExpression(value) {
  return value.match(/\(|\)|\bAND\b|\bOR\b|\bWITH\b|[A-Za-z0-9.+-]+/gu) ?? [];
}

function createSpdxParser(tokens) {
  let index = 0;

  function parsePrimary() {
    const token = tokens[index];
    if (token === undefined) return undefined;

    if (token === '(') {
      index += 1;
      const value = parseOr();
      if (tokens[index] !== ')') return undefined;
      index += 1;
      return value;
    }

    if (token === ')' || token === 'AND' || token === 'OR' || token === 'WITH') return undefined;

    index += 1;
    if (tokens[index] === 'WITH') {
      index += 2;
      return false;
    }

    return ALLOWED_LICENSES.has(token);
  }

  function parseAnd() {
    let value = parsePrimary();
    if (value === undefined) return undefined;

    while (tokens[index] === 'AND') {
      index += 1;
      const right = parsePrimary();
      if (right === undefined) return undefined;
      value = value && right;
    }

    return value;
  }

  function parseOr() {
    let value = parseAnd();
    if (value === undefined) return undefined;

    while (tokens[index] === 'OR') {
      index += 1;
      const right = parseAnd();
      if (right === undefined) return undefined;
      value = value || right;
    }

    return value;
  }

  return {
    parse: () => {
      const value = parseOr();
      return value !== undefined && index === tokens.length ? value : false;
    },
  };
}

function isAllowedLicenseExpression(expression) {
  const tokens = tokenizeSpdxExpression(expression);
  if (tokens.length === 0) return false;

  return createSpdxParser(tokens).parse();
}

function licenseExpressions(value) {
  if (typeof value === 'string')
    return value
      .split(/\s*;\s*|\s*,\s*/u)
      .map((item) => item.trim())
      .filter(Boolean);
  if (Array.isArray(value)) return value.flatMap((item) => licenseExpressions(item));
  return [];
}

function packageName(entry) {
  return typeof entry.name === 'string' && entry.name.trim() !== '' ? entry.name : '<unknown package>';
}

const raw = await readStdin();
const parsed = JSON.parse(raw);
const entries = asEntries(parsed);
const assessed = entries.map((entry) => ({
  name: packageName(entry),
  licenses: licenseExpressions(entry.licenseType ?? entry.license ?? entry.licenses),
}));

const disallowed = assessed.filter(
  (entry) => entry.licenses.length === 0 || !entry.licenses.every((license) => isAllowedLicenseExpression(license)),
);

const violations = [];
const excepted = [];
for (const entry of disallowed) {
  const outcome = applyException(entry.name, entry.licenses);
  if (outcome?.applied === true) excepted.push({ ...entry, detail: outcome.detail });
  else violations.push({ ...entry, detail: outcome?.detail });
}

if (violations.length > 0) {
  console.error('Disallowed dependency licenses found:');
  for (const violation of violations) {
    const rejection = violation.detail === undefined ? '' : ` (exception does not apply: ${violation.detail})`;
    console.error(`- ${violation.name}: ${violation.licenses.join(', ') || '<missing license>'}${rejection}`);
  }
  process.exit(1);
}

// Print the exceptions that carried the run. They belong in the log of every
// build, so that admitting a license stays a visible decision rather than a
// line in a file nobody opens again.
for (const entry of excepted) {
  console.log(`EXCEPTION ${entry.name} (${entry.licenses.join(', ')}): ${entry.detail}`);
}

// An exception that no longer does anything has outlived its reason.
const disallowedNames = new Set(disallowed.map((entry) => entry.name));
for (const name of LICENSE_EXCEPTIONS.keys()) {
  if (!assessed.some((entry) => entry.name === name)) {
    console.log(`STALE EXCEPTION ${name}: no longer a dependency, drop it from LICENSE_EXCEPTIONS`);
  } else if (!disallowedNames.has(name)) {
    console.log(`STALE EXCEPTION ${name}: now carries an allowed license, drop it from LICENSE_EXCEPTIONS`);
  }
}

const summary = new Map();
for (const entry of entries) {
  for (const license of licenseExpressions(entry.licenseType ?? entry.license ?? entry.licenses)) {
    summary.set(license, (summary.get(license) ?? 0) + 1);
  }
}

for (const [license, count] of [...summary.entries()].sort(([left], [right]) => left.localeCompare(right))) {
  console.log(`${license}: ${count}`);
}
