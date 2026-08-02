import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const i18nDir = resolve(__dirname, '../src/i18n');
const enPath = resolve(i18nDir, 'en.json');
const frPath = resolve(i18nDir, 'fr.json');

const placeholderPattern = /\b(TODO|TBD|TRANSLATE|MISSING)\b/i;
const sourceDir = resolve(__dirname, '../src');
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const translatableAttributePattern = /\b(alt|aria-label|label|placeholder|title)\s*=\s*(['"])([^'"{}]*[A-Za-z][^'"{}]*)\2/g;
const jsxTextPattern = /<[A-Za-z][^>]*>([^<>{}\r\n]*[A-Za-z][^<>{}\r\n]*)</g;
const ignoredSourceFilePattern = /(?:\.test\.[jt]sx?| - Copy\.[jt]sx?|\(OLD[^)]*\)\.[jt]sx?)$/;
// Ratchet this down whenever hard-coded UI copy is migrated into the locale files.
// CI blocks any net increase; the end state is zero, at which point this becomes
// a complete ban without making the existing translation migration unshippable.
const hardCodedUiDebtCeiling = 633;
const intentionallySharedValues = new Set([
  'Alfred',
  'Actions',
  'Aspirations',
  'Coaching',
  'Contact',
  'Cookies',
  'DELETE',
  'English',
  'Français',
  'Infrastructure',
  'Mission',
  'Performance',
  'Superstar',
  '+ Vision',
  'privacy@alfredos.ai',
  'security@alfredos.ai',
]);
const intentionallySharedUiText = new Set([
  'Alfred',
  'Mailgun',
  'OpenAI',
]);

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

function walkSourceFiles(directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(path, output);
    } else if (sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      output.push(path);
    }
  }
  return output;
}

function findReferencedTranslationKeys() {
  const references = new Map();
  const translationCallPattern = /\bt\(\s*(['"])([^'"\r\n]+)\1/g;

  for (const filePath of walkSourceFiles(sourceDir)) {
    const source = readFileSync(filePath, 'utf8');
    for (const match of source.matchAll(translationCallPattern)) {
      const key = match[2];
      const line = source.slice(0, match.index).split(/\r?\n/).length;
      const locations = references.get(key) || [];
      locations.push(`${filePath.slice(sourceDir.length + 1)}:${line}`);
      references.set(key, locations);
    }
  }

  return references;
}

function normalizeVisibleText(value) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceLocation(source, index, filePath) {
  const line = source.slice(0, index).split(/\r?\n/).length;
  return `${filePath.slice(sourceDir.length + 1)}:${line}`;
}

function findHardCodedUiText() {
  const violations = [];

  for (const filePath of walkSourceFiles(sourceDir)) {
    if (ignoredSourceFilePattern.test(filePath)) continue;
    if (!/\.[jt]sx$/.test(filePath)) continue;
    const source = readFileSync(filePath, 'utf8');

    for (const match of source.matchAll(jsxTextPattern)) {
      const value = normalizeVisibleText(match[1]);
      if (value && !intentionallySharedUiText.has(value)) {
        violations.push({
          location: sourceLocation(source, match.index, filePath),
          kind: 'JSX text',
          value,
        });
      }
    }

    for (const match of source.matchAll(translatableAttributePattern)) {
      const value = normalizeVisibleText(match[3]);
      if (value && !intentionallySharedUiText.has(value)) {
        violations.push({
          location: sourceLocation(source, match.index, filePath),
          kind: match[1],
          value,
        });
      }
    }
  }

  return violations;
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

const untranslatedFrenchValues = Object.entries(fr)
  .filter(([key, value]) => (
    typeof value === 'string' &&
    value === en[key] &&
    !intentionallySharedValues.has(value)
  ))
  .map(([key, value]) => ({ key, value }));

const referencedTranslationKeys = findReferencedTranslationKeys();
const unknownReferencedKeys = [...referencedTranslationKeys.entries()]
  .filter(([key]) => !(key in en) || !(key in fr))
  .map(([key, locations]) => ({ key, locations }));
const hardCodedUiText = findHardCodedUiText();

const hasFailures = (
  missingInFr.length > 0 ||
  missingInEn.length > 0 ||
  malformedKeys.length > 0 ||
  invalidFrenchValues.length > 0 ||
  emptyFrenchValues.length > 0 ||
  placeholderFrenchValues.length > 0 ||
  untranslatedFrenchValues.length > 0 ||
  unknownReferencedKeys.length > 0 ||
  hardCodedUiText.length > hardCodedUiDebtCeiling
);

if (!hasFailures) {
  if (hardCodedUiText.length > 0) {
    console.warn(
      `i18n validation passed with ${hardCodedUiText.length}/${hardCodedUiDebtCeiling} ` +
      'legacy hard-coded UI strings remaining. Do not increase this count; lower the ceiling as strings are migrated.'
    );
  } else {
    console.log('No hard-coded user-visible English detected.');
  }
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
printList(
  'French values still identical to English',
  untranslatedFrenchValues,
  ({ key, value }) => `${key} = ${JSON.stringify(value)}`
);
printList(
  'Translation keys used by the UI but missing from a locale',
  unknownReferencedKeys,
  ({ key, locations }) => `${key} (${locations.join(', ')})`
);
if (hardCodedUiText.length > hardCodedUiDebtCeiling) {
  console.log(
    `\nHard-coded UI translation debt increased from ${hardCodedUiDebtCeiling} ` +
    `to ${hardCodedUiText.length}. Move new text to both locale files.`
  );
  printList(
    'Hard-coded user-visible English',
    hardCodedUiText,
    ({ location, kind, value }) => `${location} [${kind}] ${JSON.stringify(value)}`
  );
}

console.log('\nPlease update app/frontend/src/i18n/en.json and app/frontend/src/i18n/fr.json before merging.');
process.exit(1);
