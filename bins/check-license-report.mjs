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

function normalizeLicenses(value) {
  if (typeof value === 'string') return value.split(/\s+(?:OR|AND)\s+|\s*;\s*|\s*,\s*/u).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap((item) => normalizeLicenses(item));
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
    licenses: normalizeLicenses(entry.licenseType ?? entry.license ?? entry.licenses),
  }))
  .filter((entry) => entry.licenses.length === 0 || entry.licenses.every((license) => !ALLOWED_LICENSES.has(license)));

if (violations.length > 0) {
  console.error('Disallowed dependency licenses found:');
  for (const violation of violations) {
    console.error(`- ${violation.name}: ${violation.licenses.join(', ') || '<missing license>'}`);
  }
  process.exit(1);
}

const summary = new Map();
for (const entry of entries) {
  for (const license of normalizeLicenses(entry.licenseType ?? entry.license ?? entry.licenses)) {
    summary.set(license, (summary.get(license) ?? 0) + 1);
  }
}

for (const [license, count] of [...summary.entries()].sort(([left], [right]) => left.localeCompare(right))) {
  console.log(`${license}: ${count}`);
}
