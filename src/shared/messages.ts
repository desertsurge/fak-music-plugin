import type { AppState } from './types';

export type RuntimeMessage =
  | { type: 'GET_STATE' }
  | { type: 'PLAY_ITEM'; presetId: string; itemId: string }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'NEXT' }
  | { type: 'PREVIOUS' }
  | { type: 'SET_VOLUME'; volume: number }
  | { type: 'TOGGLE_FAVORITE'; itemId: string }
  | { type: 'REFRESH_CATALOG' };

export type OffscreenMessage =
  | { type: 'LOAD'; url: string; volume: number; playbackId: string }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'SET_VOLUME'; volume: number }
  | { type: 'STOP' };

export type OffscreenEvent =
  | { type: 'OFFSCREEN_EVENT'; event: 'loading' | 'playing' | 'paused' | 'ended'; duration?: number; position?: number; playbackId: string }
  | { type: 'OFFSCREEN_EVENT'; event: 'error'; message: string; reason: 'source' | 'autoplay'; playbackId: string };

export type RuntimeResponse = AppState | { ok: true } | { ok: false; error: string };
