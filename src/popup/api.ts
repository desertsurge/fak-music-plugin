import { parseCatalog } from '../shared/catalog';
import type { AppState, Catalog } from '../shared/types';
import type { RuntimeMessage, RuntimeResponse } from '../shared/messages';
import { createLocalRuntime, type LocalRuntime } from './dev-runtime';

let localRuntime: LocalRuntime | undefined;
let localStatePromise: Promise<AppState> | undefined;

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

async function getLocalRuntime(): Promise<LocalRuntime> {
  if (!localRuntime) {
    localStatePromise ??= fallbackState();
    const state = await localStatePromise;
    const audio = document.querySelector<HTMLAudioElement>('#dev-audio') ?? document.createElement('audio');
    audio.id = 'dev-audio';
    audio.preload = 'none';
    audio.setAttribute('crossorigin', 'anonymous');
    if (!audio.parentElement) document.body.appendChild(audio);
    localRuntime = createLocalRuntime(state, audio);
  }
  return localRuntime;
}

export async function request(message: RuntimeMessage): Promise<RuntimeResponse> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return (await getLocalRuntime()).request(message);
  return chrome.runtime.sendMessage(message);
}

export async function loadInitialState(): Promise<RuntimeResponse> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return (await getLocalRuntime()).request({ type: 'GET_STATE' });
  return request({ type: 'GET_STATE' });
}

export function subscribeToState(callback: (state: AppState) => void): () => void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
    let unsubscribe: () => void = () => undefined;
    void getLocalRuntime().then((runtime) => { unsubscribe = runtime.subscribe(callback); });
    return () => unsubscribe();
  }
  const listener = (message: { type?: string; state?: AppState }) => {
    if ((message.type === 'STATE_UPDATED' || message.type === 'CATALOG_UPDATED') && message.state) callback(message.state);
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

export type { Catalog };
