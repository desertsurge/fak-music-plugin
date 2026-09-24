import { parseCatalog } from '../shared/catalog';
import type { AppState, Catalog } from '../shared/types';
import type { RuntimeMessage, RuntimeResponse } from '../shared/messages';

const fallbackState = async (): Promise<AppState> => {
  const response = await fetch('/presets-fallback.json');
  const catalog = parseCatalog(await response.json());
  return {
    catalog,
    catalogSource: 'fallback',
    favorites: [],
    activePresetId: catalog.presets[0]?.id ?? '',
    player: { status: 'idle', position: 0, duration: 0, volume: 0.8 },
  };
};

export async function request(message: RuntimeMessage): Promise<RuntimeResponse> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return fallbackState();
  return chrome.runtime.sendMessage(message);
}

export async function loadInitialState(): Promise<RuntimeResponse> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return fallbackState();
  return request({ type: 'GET_STATE' });
}

export function subscribeToState(callback: (state: AppState) => void): () => void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return () => undefined;
  const listener = (message: { type?: string; state?: AppState }) => {
    if ((message.type === 'STATE_UPDATED' || message.type === 'CATALOG_UPDATED') && message.state) callback(message.state);
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

export type { Catalog };
