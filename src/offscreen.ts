import type { OffscreenMessage } from './shared/messages';
import { playbackLoadTimedOut, shouldAcceptPlaybackLoad } from './shared/player';

const PLAYBACK_LOAD_TIMEOUT_MS = 8000;

const initialAudio = document.querySelector<HTMLAudioElement>('#player');
if (!initialAudio) throw new Error('Audio element is missing');
let audio: HTMLAudioElement = initialAudio;
let lastProgressReport = 0;
let activePlaybackId: string | undefined;
let loadTimeout: ReturnType<typeof setTimeout> | undefined;

const report = (playbackId: string, event: 'loading' | 'playing' | 'paused' | 'ended' | 'error', extra: Record<string, unknown> = {}) => {
  chrome.runtime.sendMessage({ type: 'OFFSCREEN_EVENT', event, playbackId, ...extra });
};

function clearLoadTimeout(): void {
  if (loadTimeout !== undefined) clearTimeout(loadTimeout);
  loadTimeout = undefined;
}

function bindAudio(element: HTMLAudioElement, playbackId: string): void {
  element.addEventListener('loadstart', () => report(playbackId, 'loading'));
  element.addEventListener('playing', () => {
    if (activePlaybackId === playbackId) clearLoadTimeout();
    report(playbackId, 'playing', { duration: element.duration || 0, position: element.currentTime });
  });
  element.addEventListener('pause', () => report(playbackId, 'paused', { position: element.currentTime }));
  element.addEventListener('ended', () => report(playbackId, 'ended'));
  element.addEventListener('timeupdate', () => {
    const now = Date.now();
    if (now - lastProgressReport < 800) return;
    lastProgressReport = now;
    report(playbackId, 'playing', { duration: element.duration || 0, position: element.currentTime });
  });
  element.addEventListener('error', () => {
    if (activePlaybackId === playbackId) clearLoadTimeout();
    report(playbackId, 'error', { message: '音频源无法播放', reason: 'source' });
  });
}

chrome.runtime.onMessage.addListener((message: OffscreenMessage) => {
  if (message.type === 'LOAD') {
    if (!shouldAcceptPlaybackLoad(message.playbackId, activePlaybackId)) return;
    clearLoadTimeout();
    activePlaybackId = message.playbackId;
    audio.pause();
    const nextAudio = document.createElement('audio');
    nextAudio.id = 'player';
    audio.replaceWith(nextAudio);
    audio = nextAudio;
    bindAudio(audio, activePlaybackId);
    audio.src = message.url;
    audio.volume = message.volume;
    const playbackId = activePlaybackId;
    const loadStartedAt = Date.now();
    loadTimeout = setTimeout(() => {
      if (activePlaybackId !== playbackId || !playbackLoadTimedOut(loadStartedAt, Date.now(), PLAYBACK_LOAD_TIMEOUT_MS)) return;
      clearLoadTimeout();
      report(playbackId, 'error', { message: '音频源连接超时', reason: 'source' });
    }, PLAYBACK_LOAD_TIMEOUT_MS);
    void audio.play().catch(() => report(playbackId, 'error', { message: '浏览器拒绝自动播放，请点击播放', reason: 'autoplay' }));
  } else if (message.type === 'PLAY') {
    if (!activePlaybackId) return;
    const playbackId = activePlaybackId;
    void audio.play().catch(() => report(playbackId, 'error', { message: '当前音频无法播放', reason: 'autoplay' }));
  } else if (message.type === 'PAUSE') {
    audio.pause();
  } else if (message.type === 'SET_VOLUME') {
    audio.volume = message.volume;
  } else if (message.type === 'STOP') {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
});
