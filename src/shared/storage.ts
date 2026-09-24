import type { AppState, Catalog, PlayerState } from './types';
import { parseCatalog } from './catalog';

export const STORAGE_KEYS = {
  catalog: 'catalog',
  catalogSource: 'catalogSource',
  favorites: 'favorites',
  player: 'player',
} as const;

export const DEFAULT_PLAYER: PlayerState = {
  status: 'idle', position: 0, duration: 0, volume: 0.8,
};

export function normalizeCatalogSource(value: unknown): AppState['catalogSource'] {
  return value === 'remote' || value === 'cache' || value === 'fallback' ? value : 'fallback';
}

export function shouldUsePersistedCatalog(source: AppState['catalogSource']): boolean {
  return source === 'cache' || source === 'remote';
}

export async function readPersistedState(catalog: Catalog): Promise<AppState> {
  const stored = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const catalogSource = normalizeCatalogSource(stored[STORAGE_KEYS.catalogSource]);
  let persistedCatalog = catalog;
  if (stored[STORAGE_KEYS.catalog] && shouldUsePersistedCatalog(catalogSource)) {
    try {
      persistedCatalog = parseCatalog(stored[STORAGE_KEYS.catalog]);
    } catch {
      persistedCatalog = catalog;
    }
  }
  return {
    catalog: persistedCatalog,
    catalogSource,
    favorites: Array.isArray(stored[STORAGE_KEYS.favorites]) ? stored[STORAGE_KEYS.favorites] : [],
    player: { ...DEFAULT_PLAYER, ...(stored[STORAGE_KEYS.player] ?? {}) },
    activePresetId: (stored[STORAGE_KEYS.player]?.currentPresetId as string | undefined) ?? persistedCatalog.presets[0]?.id ?? '',
  };
}

export async function persistState(state: Pick<AppState, 'catalog' | 'catalogSource' | 'favorites' | 'player'>): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.catalog]: state.catalog,
    [STORAGE_KEYS.catalogSource]: state.catalogSource,
    [STORAGE_KEYS.favorites]: state.favorites,
    [STORAGE_KEYS.player]: state.player,
  });
}
