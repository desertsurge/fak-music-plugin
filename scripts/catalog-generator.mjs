const DEFAULT_CODECS = ['MP3', 'AAC', 'OGG'];

export function isHttpUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function normalizeCodec(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizeTags(value) {
  if (typeof value !== 'string') return undefined;
  const tags = [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))];
  return tags.length > 0 ? tags : undefined;
}

export function normalizeStation(station, allowedCodecs = DEFAULT_CODECS) {
  if (!station || typeof station !== 'object') return null;
  const id = typeof station.stationuuid === 'string' ? station.stationuuid.trim() : '';
  const title = typeof station.name === 'string' ? station.name.trim() : '';
  const streamUrl = typeof station.url_resolved === 'string' ? station.url_resolved.trim() : '';
  const codec = normalizeCodec(station.codec);
  const supportedCodecs = new Set(allowedCodecs.map(normalizeCodec));
  if (Number(station.lastcheckok) !== 1 || !id || !title || !isHttpUrl(streamUrl) || !supportedCodecs.has(codec)) return null;

  const item = {
    id: `radio-browser-${id}`,
    title,
    streamUrl,
    codec: codec.toLowerCase(),
  };
  if (isHttpUrl(station.homepage)) item.homepage = station.homepage.trim();
  if (typeof station.countrycode === 'string' && station.countrycode.trim()) item.country = station.countrycode.trim().toUpperCase();
  const tags = normalizeTags(station.tags);
  if (tags) item.tags = tags;
  if (typeof station.lastchecktime_iso8601 === 'string' && station.lastchecktime_iso8601.trim()) {
    item.lastCheckedAt = station.lastchecktime_iso8601.trim();
  }
  return item;
}

export function rankStations(left, right) {
  const leftHttps = String(left?.url_resolved ?? '').startsWith('https://');
  const rightHttps = String(right?.url_resolved ?? '').startsWith('https://');
  return Number(rightHttps) - Number(leftHttps)
    || Number(right?.clickcount ?? 0) - Number(left?.clickcount ?? 0)
    || Number(right?.votes ?? 0) - Number(left?.votes ?? 0)
    || String(left?.stationuuid ?? '').localeCompare(String(right?.stationuuid ?? ''));
}

export function deduplicateStations(stations, allowedCodecs = DEFAULT_CODECS) {
  const stationIds = new Set();
  const streamUrls = new Set();
  return [...stations].sort(rankStations).filter((station) => {
    const normalized = normalizeStation(station, allowedCodecs);
    if (!normalized) return false;
    const stationId = String(station.stationuuid).trim();
    const streamUrl = normalized.streamUrl;
    if (stationIds.has(stationId) || streamUrls.has(streamUrl)) return false;
    stationIds.add(stationId);
    streamUrls.add(streamUrl);
    return true;
  });
}

export function buildPreset(rule, stations, allowedCodecs = DEFAULT_CODECS) {
  const items = deduplicateStations(stations, allowedCodecs)
    .map((station) => normalizeStation(station, allowedCodecs))
    .filter(Boolean)
    .slice(0, rule.limit);
  if (items.length < rule.minimumItems) {
    throw new Error(`Preset ${rule.id} has ${items.length} items; requires ${rule.minimumItems}`);
  }
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    type: 'station',
    source: 'radio-browser',
    items,
  };
}

export function buildCatalog(rules, stationsByPreset, generatedAt) {
  return {
    schemaVersion: 1,
    generatedAt,
    presets: rules.presets.map((rule) => buildPreset(rule, stationsByPreset[rule.id] ?? [], rules.allowedCodecs)),
  };
}
