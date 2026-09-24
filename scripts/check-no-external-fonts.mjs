import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const distRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const externalFontHost = 'fonts.googleapis.com';

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await filesUnder(path));
    } else {
      files.push(path);
    }
  }

  return files;
}

const violations = [];
for (const file of await filesUnder(distRoot)) {
  const content = await readFile(file, 'utf8');
  if (content.includes(externalFontHost)) {
    violations.push(relative(distRoot, file));
  }
}

if (violations.length > 0) {
  console.error(`External font host found in build output: ${violations.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Build output contains no external Google Fonts host.');
}
