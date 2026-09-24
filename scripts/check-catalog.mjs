import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { run } from './catalog-generator.mjs';

const FIXTURE_TIME = '2026-09-24T00:00:00.000Z';

function validateCatalog(catalog) {
  if (catalog?.schemaVersion !== 1 || typeof catalog.generatedAt !== 'string' || !Array.isArray(catalog.presets) || catalog.presets.length === 0) {
    throw new Error('Generated catalog does not match schema version 1');
  }
  for (const preset of catalog.presets) {
    if (!preset.id || !preset.name || preset.type !== 'station' || !preset.source || !Array.isArray(preset.items) || preset.items.length === 0) {
      throw new Error(`Invalid preset: ${preset?.id ?? 'unknown'}`);
    }
    for (const item of preset.items) {
      if (!item.id || !item.title || !/^https?:\/\//i.test(item.streamUrl)) {
        throw new Error(`Invalid station in preset ${preset.id}`);
      }
    }
  }
}

const repositoryRoot = resolve(import.meta.dirname, '..');
const output = await mkdtemp(join(tmpdir(), 'fak-music-catalog-check-'));
try {
  await run([
    '--fixture', resolve(repositoryRoot, 'scripts', 'fixtures', 'radio-browser-stations.json'),
    '--output', output,
    '--generated-at', FIXTURE_TIME,
  ]);
  const catalog = JSON.parse(await readFile(join(output, 'presets.json'), 'utf8'));
  const health = JSON.parse(await readFile(join(output, 'health.json'), 'utf8'));
  const index = await readFile(join(output, 'index.html'), 'utf8');
  validateCatalog(catalog);
  const itemCount = catalog.presets.reduce((total, preset) => total + preset.items.length, 0);
  if (health.status !== 'ok' || health.presetCount !== catalog.presets.length || health.itemCount !== itemCount) {
    throw new Error('Generated health metadata does not match the catalog');
  }
  if (!index.includes('Fak Music Catalog') || !index.includes('presets.json') || !index.includes('health.json')) {
    throw new Error('Generated catalog index is incomplete');
  }
  process.stdout.write(`Catalog check passed: ${catalog.presets.length} presets, ${itemCount} stations\n`);
} finally {
  await rm(output, { recursive: true, force: true });
}
