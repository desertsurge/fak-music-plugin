import { describe, expect, it, vi } from 'vitest';
import type { AppState } from '../shared/types';
import { createLocalRuntime } from './dev-runtime';

const state: AppState = {
  catalog: {
    schemaVersion: 1,
    generatedAt: '2026-09-24T00:00:00Z',
    presets: [{
      id: 'radio', name: 'Radio', type: 'station', source: 'test',
      items: [{ id: 'station', title: 'Station', streamUrl: 'https://audio.example/station.mp3' }],
    }],
  },
  catalogSource: 'fallback',
  favorites: [],
  activePresetId: 'radio',
  player: { status: 'idle', position: 0, duration: 0, volume: 0.8 },
};

describe('local development runtime', () => {
  it('loads a real audio source when a card is played', () => {
    const audio = { src: '', volume: 0, paused: true, play: vi.fn(), pause: vi.fn() } as unknown as HTMLAudioElement;
    const runtime = createLocalRuntime(structuredClone(state), audio);

    const next = runtime.request({ type: 'PLAY_ITEM', presetId: 'radio', itemId: 'station' }) as AppState;

    expect(audio.src).toBe('https://audio.example/station.mp3');
    expect(audio.volume).toBe(0.8);
    expect(audio.play).toHaveBeenCalledOnce();
    expect(next.player.status).toBe('playing');
  });

  it('pauses and resumes the same audio through the player toggle', () => {
    const audio = { src: '', volume: 0, paused: true, play: vi.fn(), pause: vi.fn() } as unknown as HTMLAudioElement;
    const runtime = createLocalRuntime(structuredClone(state), audio);
    runtime.request({ type: 'PLAY_ITEM', presetId: 'radio', itemId: 'station' });
    vi.mocked(audio.pause).mockClear();
    vi.mocked(audio.play).mockClear();
    runtime.request({ type: 'TOGGLE_PLAY' });
    runtime.request({ type: 'TOGGLE_PLAY' });

    expect(audio.pause).toHaveBeenCalledOnce();
    expect(audio.play).toHaveBeenCalledOnce();
  });
});
