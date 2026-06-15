import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const i18nDir = resolve(__dirname, '../src/i18n');
const enPath = resolve(i18nDir, 'en.json');
const frPath = resolve(i18nDir, 'fr.json');

const placeholderPattern = /\b(TODO|TBD|TRANSLATE|MISSING)\b/i;

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Failed to read ${filePath}: ${error.message}`);
    process.exitCode = 1;
    return {};
  }
}

function flatten(value, prefix = '', output = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      const nextKey = prefix ? `${prefix}.${key}` : key;
      flatten(nestedValue, nextKey, output);
    }
    return output;
  }

  output[prefix] = value;
  return output;
}

function findMalformedKeys(keys) {
  return keys.filter((key) => (
    !key ||
    key.trim() !== key ||
    key.includes('..') ||
    key.split('.').some((segment) => segment.trim() === '')
  ));
}

function printList(title, items, format = (item) => item) {
  if (items.length === 0) {
    return;
  }

  console.log(`\n${title}:`);
  for (const item of items) {
    console.log(`- ${format(item)}`);
  }
}

const en = flatten(readJson(enPath));
const fr = flatten(readJson(frPath));

const enKeys = Object.keys(en).sort();
const frKeys = Object.keys(fr).sort();

const missingInFr = enKeys.filter((key) => !(key in fr));
const missingInEn = frKeys.filter((key) => !(key in en));
const malformedKeys = [...new Set([
  ...findMalformedKeys(enKeys),
  ...findMalformedKeys(frKeys),
])].sort();

const invalidFrenchValues = Object.entries(fr)
  .filter(([, value]) => typeof value !== 'string')
  .map(([key, value]) => ({ key, value, reason: `expected string, received ${typeof value}` }));

const emptyFrenchValues = Object.entries(fr)
  .filter(([, value]) => typeof value === 'string' && value.trim() === '')
  .map(([key, value]) => ({ key, value }));

const placeholderFrenchValues = Object.entries(fr)
  .filter(([, value]) => typeof value === 'string' && placeholderPattern.test(value.trim()))
  .map(([key, value]) => ({ key, value }));

const hasFailures = (
  missingInFr.length > 0 ||
  missingInEn.length > 0 ||
  malformedKeys.length > 0 ||
  invalidFrenchValues.length > 0 ||
  emptyFrenchValues.length > 0 ||
  placeholderFrenchValues.length > 0
);

if (!hasFailures) {
  console.log('i18n validation passed');
  process.exit(0);
}

console.log('i18n validation failed');
printList('Missing French translations', missingInFr);
printList('Missing English translations', missingInEn);
printList('Malformed translation keys', malformedKeys);
printList(
  'Invalid French translation values',
  invalidFrenchValues,
  ({ key, reason }) => `${key} (${reason})`
);
printList('Empty French translations', emptyFrenchValues, ({ key }) => key);
printList(
  'Placeholder French translations',
  placeholderFrenchValues,
  ({ key, value }) => `${key} = ${JSON.stringify(value)}`
);

console.log('\nPlease update app/frontend/src/i18n/en.json and app/frontend/src/i18n/fr.json before merging.');
process.exit(1);
