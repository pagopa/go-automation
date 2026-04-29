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
const violations = entries
  .map((entry) => ({
    name: packageName(entry),
    licenses: licenseExpressions(entry.licenseType ?? entry.license ?? entry.licenses),
  }))
  .filter(
    (entry) => entry.licenses.length === 0 || !entry.licenses.every((license) => isAllowedLicenseExpression(license)),
  );

if (violations.length > 0) {
  console.error('Disallowed dependency licenses found:');
  for (const violation of violations) {
    console.error(`- ${violation.name}: ${violation.licenses.join(', ') || '<missing license>'}`);
  }
  process.exit(1);
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
