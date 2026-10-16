import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.resolve(process.cwd(), 'src');
const I18N_DIR = path.resolve(SRC_DIR, 'i18n');

// Matches common Polish diacritics: ąćęłńóśźżĄĆĘŁŃÓŚŹŻ
const POLISH_DIACRITICS_REGEX = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

function checkFile(filePath: string): boolean {
  if (filePath.startsWith(I18N_DIR)) {
    return true; // Translations are allowed inside src/i18n/
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  let hasErrors = false;

  lines.forEach((line, index) => {
    // Exclude comments if needed, but strict check is better for portfolio cleanliness
    if (POLISH_DIACRITICS_REGEX.test(line)) {
      console.error(
        `[i18n-check] Polish diacritics found outside src/i18n in ${path.relative(process.cwd(), filePath)}:${index + 1}:`,
      );
      console.error(`  ${line.trim()}`);
      hasErrors = true;
    }
  });

  return !hasErrors;
}

function traverse(dir: string): boolean {
  let allClean = true;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!traverse(fullPath)) allClean = false;
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      if (!checkFile(fullPath)) allClean = false;
    }
  }

  return allClean;
}

const passed = traverse(SRC_DIR);
if (!passed) {
  console.error('\n❌ i18n check failed: Hardcoded Polish texts found in source code.');
  console.error('All user-facing texts must reside in src/i18n/ dictionary.\n');
  process.exit(1);
} else {
  console.log('✅ i18n check passed: No leaked translations in source files.');
}
