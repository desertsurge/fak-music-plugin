import { describe, expect, it } from 'vitest';

const moduleUrl = new URL('./catalog-generator.mjs', import.meta.url).href;
const loadGenerator = () => import(moduleUrl);

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
