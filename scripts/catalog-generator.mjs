import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CODECS = ['MP3', 'AAC', 'OGG'];
const RADIO_BROWSER_DISCOVERY_URLS = [
  'https://all.api.radio-browser.info/json/servers',
  'https://de1.api.radio-browser.info/json/servers',
  'https://de2.api.radio-browser.info/json/servers',
];
const DEFAULT_OUTPUT = 'catalog/generated';
const REQUEST_TIMEOUT_MS = 12_000;

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

async function fetchJson(url, fetcher = fetch, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      headers: { 'user-agent': 'fak-music-catalog/0.1' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Request timed out: ${url}`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverRadioBrowserServers(fetcher = fetch) {
  const errors = [];
  for (const url of RADIO_BROWSER_DISCOVERY_URLS) {
    try {
      const response = await fetchJson(url, fetcher);
      const servers = Array.isArray(response)
        ? response.map((server) => server?.name).filter((name) => typeof name === 'string' && name.trim()).map((name) => `https://${name.trim()}`)
        : [];
      if (servers.length > 0) return [...new Set(servers)].sort();
      errors.push(`${url}: no API servers`);
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Radio Browser discovery failed: ${errors.join('; ')}`);
}

async function fetchStationsForRule(rule, servers, fetcher = fetch) {
  const queryLimit = Math.max(rule.limit * 5, 40);
  const path = `/json/stations/bytag/${encodeURIComponent(rule.tag)}?hidebroken=true&order=clickcount&reverse=true&limit=${queryLimit}`;
  const errors = [];
  for (const server of servers) {
    try {
      const response = await fetchJson(`${server}${path}`, fetcher);
      if (!Array.isArray(response)) throw new Error('response is not an array');
      return response;
    } catch (error) {
      errors.push(`${server}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Radio Browser query failed for ${rule.id}: ${errors.join('; ')}`);
}

export async function fetchRadioBrowserPresets(rules, fetcher = fetch) {
  const servers = await discoverRadioBrowserServers(fetcher);
  const stationsByPreset = {};
  for (const rule of rules.presets) {
    stationsByPreset[rule.id] = await fetchStationsForRule(rule, servers, fetcher);
  }
  return { stationsByPreset, servers };
}

function jsonFile(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildHealth(catalog, upstreamServers) {
  return {
    schemaVersion: 1,
    generatedAt: catalog.generatedAt,
    status: 'ok',
    source: 'radio-browser',
    presetCount: catalog.presets.length,
    itemCount: catalog.presets.reduce((total, preset) => total + preset.items.length, 0),
    presets: catalog.presets.map((preset) => ({ id: preset.id, itemCount: preset.items.length })),
    upstreamServers,
  };
}

function buildIndex(catalog) {
  const rows = catalog.presets.map((preset) => `<tr><td>${preset.name}</td><td>${preset.items.length}</td><td>${preset.source}</td></tr>`).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Fak Music Catalog</title></head>
<body><main><h1>Fak Music Catalog</h1><p>Generated at ${catalog.generatedAt}</p><table><thead><tr><th>Preset</th><th>Stations</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table><p><a href="./presets.json">presets.json</a> · <a href="./health.json">health.json</a></p></main></body>
</html>
`;
}

export async function writeBundle(outputDirectory, catalog, upstreamServers = []) {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(resolve(outputDirectory, 'presets.json'), jsonFile(catalog), 'utf8'),
    writeFile(resolve(outputDirectory, 'health.json'), jsonFile(buildHealth(catalog, upstreamServers)), 'utf8'),
    writeFile(resolve(outputDirectory, 'index.html'), buildIndex(catalog), 'utf8'),
  ]);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function resolveInput(path) {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

export async function run(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      fixture: { type: 'string' },
      output: { type: 'string', default: DEFAULT_OUTPUT },
      'generated-at': { type: 'string' },
    },
  });
  const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const rules = await readJson(resolve(projectRoot, 'catalog', 'rules.json'));
  const generatedAt = values['generated-at'] ?? new Date().toISOString();
  if (!generatedAt.trim() || Number.isNaN(Date.parse(generatedAt))) throw new Error('generated-at must be an ISO date');

  let stationsByPreset;
  let upstreamServers = [];
  if (values.fixture) {
    stationsByPreset = await readJson(resolveInput(values.fixture));
  } else {
    const live = await fetchRadioBrowserPresets(rules);
    stationsByPreset = live.stationsByPreset;
    upstreamServers = live.servers;
  }
  const catalog = buildCatalog(rules, stationsByPreset, generatedAt);
  await writeBundle(resolveInput(values.output), catalog, upstreamServers);
  return catalog;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
