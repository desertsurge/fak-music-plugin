import { describe, expect, it } from 'vitest';
import { parseCatalog } from './catalog';

describe('parseCatalog', () => {
  it('accepts stations and licensed tracks', () => {
    const catalog = parseCatalog({
      schemaVersion: 1,
      generatedAt: '2026-09-23T00:00:00Z',
      presets: [
        {
          id: 'jazz', name: 'Jazz', type: 'station', source: 'radio-browser',
          items: [{ id: 'station-1', title: 'Jazz FM', streamUrl: 'https://example.com/jazz.mp3' }],
        },
        {
          id: 'cc', name: 'CC', type: 'tracks', source: 'archive',
          items: [{ id: 'track-1', title: 'Blue Hour', artist: 'A. Artist', audioUrl: 'https://example.com/blue.mp3', license: 'CC BY 4.0', sourceUrl: 'https://example.com/blue' }],
        },
      ],
    });

    expect(catalog.presets).toHaveLength(2);
  });

  it('drops malformed entries and unlicensed tracks', () => {
    const catalog = parseCatalog({
      schemaVersion: 1,
      generatedAt: '2026-09-23T00:00:00Z',
      presets: [
        {
          id: 'mixed', name: 'Mixed', type: 'tracks', source: 'test',
          items: [
            { id: 'missing-audio', title: 'No audio', artist: 'Nobody', license: 'CC BY', sourceUrl: 'https://example.com' },
            { id: 'missing-license', title: 'No license', artist: 'Nobody', audioUrl: 'https://example.com/no.mp3', sourceUrl: 'https://example.com' },
            { id: 'valid', title: 'Valid', artist: 'Somebody', audioUrl: 'https://example.com/yes.mp3', license: 'Public Domain', sourceUrl: 'https://example.com' },
          ],
        },
      ],
    });

    expect(catalog.presets[0]?.items).toHaveLength(1);
    expect(catalog.presets[0]?.items[0]?.id).toBe('valid');
  });

  it('rejects catalogs without a supported schema version', () => {
    expect(() => parseCatalog({ schemaVersion: 2, generatedAt: 'now', presets: [] })).toThrow('Unsupported catalog schema');
  });
});
