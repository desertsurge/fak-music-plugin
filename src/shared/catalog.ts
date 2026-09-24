import type { Catalog, Preset, StationItem, TrackItem } from './types';

const URL_PATTERN = /^https?:\/\//i;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';
const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const httpUrl = (value: unknown): value is string => nonEmptyString(value) && URL_PATTERN.test(value);

function parseStationItem(value: unknown): StationItem | null {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.title) || !httpUrl(value.streamUrl)) return null;
  return {
    id: value.id,
    title: value.title,
    streamUrl: value.streamUrl,
    backupUrls: Array.isArray(value.backupUrls) ? value.backupUrls.filter(httpUrl) : undefined,
    codec: nonEmptyString(value.codec) ? value.codec : undefined,
    homepage: httpUrl(value.homepage) ? value.homepage : undefined,
    country: nonEmptyString(value.country) ? value.country : undefined,
    tags: Array.isArray(value.tags) ? value.tags.filter(nonEmptyString) : undefined,
    lastCheckedAt: nonEmptyString(value.lastCheckedAt) ? value.lastCheckedAt : undefined,
  };
}

function parseTrackItem(value: unknown): TrackItem | null {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.title) || !nonEmptyString(value.artist)) return null;
  if (!httpUrl(value.audioUrl) || !nonEmptyString(value.license) || !httpUrl(value.sourceUrl)) return null;
  return {
    id: value.id,
    title: value.title,
    artist: value.artist,
    audioUrl: value.audioUrl,
    backupUrls: Array.isArray(value.backupUrls) ? value.backupUrls.filter(httpUrl) : undefined,
    album: nonEmptyString(value.album) ? value.album : undefined,
    artworkUrl: httpUrl(value.artworkUrl) ? value.artworkUrl : undefined,
    license: value.license,
    sourceUrl: value.sourceUrl,
    attribution: nonEmptyString(value.attribution) ? value.attribution : undefined,
    tags: Array.isArray(value.tags) ? value.tags.filter(nonEmptyString) : undefined,
  };
}

function parsePreset(value: unknown): Preset | null {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.name) || !nonEmptyString(value.source) || !Array.isArray(value.items)) return null;
  const items = value.type === 'station'
    ? value.items.map(parseStationItem).filter((item): item is StationItem => item !== null)
    : value.type === 'tracks'
      ? value.items.map(parseTrackItem).filter((item): item is TrackItem => item !== null)
      : [];
  if (items.length === 0) return null;
  return {
    id: value.id,
    name: value.name,
    description: nonEmptyString(value.description) ? value.description : undefined,
    type: value.type,
    source: value.source,
    items,
  } as Preset;
}

export function parseCatalog(input: unknown): Catalog {
  if (!isRecord(input) || input.schemaVersion !== 1 || !nonEmptyString(input.generatedAt) || !Array.isArray(input.presets)) {
    throw new Error('Unsupported catalog schema');
  }
  const presets = input.presets.map(parsePreset).filter((preset): preset is Preset => preset !== null);
  if (presets.length === 0) throw new Error('Catalog contains no playable presets');
  return { schemaVersion: 1, generatedAt: input.generatedAt, presets };
}

export function flattenPresetItems(catalog: Catalog): Array<{ preset: Preset; item: StationItem | TrackItem }> {
  return catalog.presets.flatMap((preset) => preset.items.map((item) => ({ preset, item })));
}
