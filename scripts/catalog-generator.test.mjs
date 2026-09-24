import { describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleUrl = new URL('./catalog-generator.mjs', import.meta.url).href;
const loadGenerator = () => import(moduleUrl);
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fixturePath = join(repositoryRoot, 'scripts', 'fixtures', 'radio-browser-stations.json');
const fixedTime = '2026-09-24T00:00:00.000Z';

function runGenerator(output, fixture = fixturePath) {
  return spawnSync(process.execPath, [
    'scripts/catalog-generator.mjs',
    '--fixture', fixture,
    '--output', output,
    '--generated-at', fixedTime,
  ], { cwd: repositoryRoot, encoding: 'utf8' });
}

const baseStation = {
  stationuuid: 'station-1',
  name: '  Station One  ',
  url_resolved: 'http://streams.example.test/one.mp3',
  homepage: 'https://radio.example.test/one',
  tags: ' jazz, instrumental ',
  countrycode: 'us',
  codec: 'MP3',
  clickcount: 10,
  votes: 2,
  lastcheckok: 1,
  lastchecktime_iso8601: '2026-09-24T00:00:00Z',
};

const rule = {
  id: 'jazz',
  name: 'Jazz',
  description: 'Jazz stations',
  tag: 'jazz',
  minimumItems: 1,
  limit: 3,
};

describe('catalog generator mapping', () => {
  it('accepts only HTTP and HTTPS URLs', async () => {
    const { isHttpUrl } = await loadGenerator();
    expect(isHttpUrl('http://radio.test/stream')).toBe(true);
    expect(isHttpUrl('https://radio.test/stream')).toBe(true);
    expect(isHttpUrl('file:///tmp/stream')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
  });

  it('maps a healthy station to the extension schema', async () => {
    const { normalizeStation } = await loadGenerator();
    expect(normalizeStation(baseStation, ['MP3', 'AAC', 'OGG'])).toEqual({
      id: 'radio-browser-station-1',
      title: 'Station One',
      streamUrl: 'http://streams.example.test/one.mp3',
      codec: 'mp3',
      homepage: 'https://radio.example.test/one',
      country: 'US',
      tags: ['jazz', 'instrumental'],
      lastCheckedAt: '2026-09-24T00:00:00Z',
    });
  });

  it.each([
    [{ ...baseStation, lastcheckok: 0 }],
    [{ ...baseStation, name: ' ' }],
    [{ ...baseStation, url_resolved: 'ftp://radio.test/one' }],
    [{ ...baseStation, codec: 'FLAC' }],
  ])('rejects unhealthy or unsupported station %#', async (station) => {
    const { normalizeStation } = await loadGenerator();
    expect(normalizeStation(station, ['MP3', 'AAC', 'OGG'])).toBeNull();
  });

  it('ranks HTTPS first and deduplicates UUIDs and stream URLs', async () => {
    const { deduplicateStations } = await loadGenerator();
    const stations = [
      baseStation,
      { ...baseStation, name: 'Secure duplicate', url_resolved: 'https://streams.example.test/one.mp3' },
      { ...baseStation, stationuuid: 'station-2', name: 'Same URL', url_resolved: 'https://streams.example.test/one.mp3', clickcount: 1 },
      { ...baseStation, stationuuid: 'station-3', name: 'Unique', url_resolved: 'https://streams.example.test/three.mp3' },
    ];
    const result = deduplicateStations(stations, ['MP3', 'AAC', 'OGG']);
    expect(result).toHaveLength(2);
    expect(result[0].url_resolved).toBe('https://streams.example.test/one.mp3');
    expect(new Set(result.map((station) => station.stationuuid)).size).toBe(2);
  });

  it('builds presets and catalog in configured order', async () => {
    const { buildCatalog, buildPreset } = await loadGenerator();
    const preset = buildPreset(rule, [baseStation], ['MP3', 'AAC', 'OGG']);
    expect(preset).toMatchObject({ id: 'jazz', type: 'station', source: 'radio-browser' });
    const rules = { schemaVersion: 1, source: 'radio-browser', allowedCodecs: ['MP3', 'AAC', 'OGG'], presets: [rule] };
    expect(buildCatalog(rules, { jazz: [baseStation] }, '2026-09-24T00:00:00.000Z')).toEqual({
      schemaVersion: 1,
      generatedAt: '2026-09-24T00:00:00.000Z',
      presets: [preset],
    });
  });

  it('rejects a preset below its configured minimum', async () => {
    const { buildPreset } = await loadGenerator();
    expect(() => buildPreset({ ...rule, minimumItems: 2 }, [baseStation], ['MP3'])).toThrow('requires 2');
  });
});

describe('Radio Browser discovery', () => {
  it('falls back to an official mirror when the all-server endpoint fails', async () => {
    const { discoverRadioBrowserServers } = await loadGenerator();
    const fetcher = vi.fn(async (url) => {
      if (String(url).includes('all.api.radio-browser.info')) throw new Error('read ECONNRESET');
      return new Response(JSON.stringify([{ name: 'de1.api.radio-browser.info' }]), { status: 200 });
    });

    await expect(discoverRadioBrowserServers(fetcher)).resolves.toEqual(['https://de1.api.radio-browser.info']);
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://de1.api.radio-browser.info/json/servers', expect.any(Object));
  });
});

describe('catalog generator CLI', () => {
  it('writes the complete static Pages bundle from a fixture', () => {
    const output = mkdtempSync(join(tmpdir(), 'fak-music-catalog-'));
    try {
      const result = runGenerator(output);
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(existsSync(join(output, 'presets.json'))).toBe(true);
      expect(existsSync(join(output, 'health.json'))).toBe(true);
      expect(existsSync(join(output, 'index.html'))).toBe(true);
      const catalog = JSON.parse(readFileSync(join(output, 'presets.json'), 'utf8'));
      expect(catalog).toMatchObject({ schemaVersion: 1, generatedAt: fixedTime });
      expect(catalog.presets.map((preset) => preset.id)).toEqual(['lofi', 'jazz', 'classical', 'ambient', 'electronic']);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });

  it('produces byte-identical JSON for the same fixture and timestamp', () => {
    const first = mkdtempSync(join(tmpdir(), 'fak-music-catalog-first-'));
    const second = mkdtempSync(join(tmpdir(), 'fak-music-catalog-second-'));
    try {
      expect(runGenerator(first).status).toBe(0);
      expect(runGenerator(second).status).toBe(0);
      expect(readFileSync(join(first, 'presets.json'), 'utf8')).toBe(readFileSync(join(second, 'presets.json'), 'utf8'));
      expect(readFileSync(join(first, 'health.json'), 'utf8')).toBe(readFileSync(join(second, 'health.json'), 'utf8'));
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });

  it('fails without publishing when a category has too few stations', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'fak-music-catalog-invalid-'));
    const output = join(workspace, 'output');
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    fixture.jazz = fixture.jazz.slice(0, 1);
    const invalidFixture = join(workspace, 'fixture.json');
    writeFileSync(invalidFixture, JSON.stringify(fixture), 'utf8');
    try {
      const result = runGenerator(output, invalidFixture);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Preset jazz has 1 items; requires 3');
      expect(existsSync(output)).toBe(false);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('checks a fixture bundle without writing to the tracked output directory', () => {
    const result = spawnSync(process.execPath, ['scripts/check-catalog.mjs'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Catalog check passed: 5 presets, 15 stations');
  });

  it('rejects an invalid generated bundle passed through --input', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'fak-music-catalog-check-input-'));
    const input = join(workspace, 'generated');
    mkdirSync(input);
    writeFileSync(join(input, 'presets.json'), JSON.stringify({ schemaVersion: 2, presets: [] }), 'utf8');
    writeFileSync(join(input, 'health.json'), JSON.stringify({ status: 'ok', presetCount: 0, itemCount: 0 }), 'utf8');
    writeFileSync(join(input, 'index.html'), '<title>Fak Music Catalog</title><a href="presets.json">presets</a><a href="health.json">health</a>', 'utf8');
    try {
      const result = spawnSync(process.execPath, ['scripts/check-catalog.mjs', '--input', input], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Generated catalog does not match schema version 1');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
