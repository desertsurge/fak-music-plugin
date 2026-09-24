import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Volume2 } from 'lucide-react';
import type { PlayerState } from '../../shared/types';

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '--:--';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function PlayerBar({ player, onToggle, onRetry, onNext, onPrevious, onVolume }: { player: PlayerState; onToggle: () => void; onRetry: () => void; onNext: () => void; onPrevious: () => void; onVolume: (value: number) => void }) {
  const playing = player.status === 'playing' || player.status === 'loading';
  const canRetry = player.status === 'error' && Boolean(player.currentPresetId && player.currentItemId);
  return (
    <footer className="player-bar">
      <div className="now-playing">
        <div className="mini-cover">{player.currentTitle?.slice(0, 1).toUpperCase() ?? '♪'}</div>
        <div className="now-copy"><span className="now-label">{player.status === 'error' ? '播放失败' : '正在播放'}</span><strong>{player.currentTitle ?? '选择一项开始播放'}</strong><small className={player.error ? 'player-error' : undefined}>{player.error ?? player.currentArtist ?? 'Fak Music · 公开音乐目录'}</small></div>
      </div>
      <div className="transport">
        <div className="transport-actions">
          <button className="icon-button" type="button" onClick={onPrevious} aria-label="上一项" title="上一项"><ChevronLeft size={17} /></button>
          <button className="main-play" type="button" onClick={onToggle} aria-label={playing ? '暂停播放' : '开始播放'} title={playing ? '暂停' : '播放'}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
          {canRetry && <button className="retry-button" type="button" onClick={onRetry} aria-label="重试播放" title="重试播放"><RotateCcw size={14} /><span>重试</span></button>}
          <button className="icon-button" type="button" onClick={onNext} aria-label="下一项" title="下一项"><ChevronRight size={17} /></button>
        </div>
        <div className="progress-line"><span style={{ width: player.duration ? `${Math.min(100, (player.position / player.duration) * 100)}%` : '0%' }} /></div>
        <div className="time-line"><span>{formatTime(player.position)}</span><span>{formatTime(player.duration)}</span></div>
      </div>
      <label className="volume-control" title="音量"><Volume2 size={15} /><input aria-label="音量" type="range" min="0" max="1" step="0.05" value={player.volume} onChange={(event) => onVolume(Number(event.target.value))} /></label>
    </footer>
  );
}
