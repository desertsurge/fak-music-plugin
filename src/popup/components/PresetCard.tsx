import { ExternalLink, Heart, Pause, Play, Radio, ShieldCheck } from 'lucide-react';
import type { Preset, StationItem, TrackItem } from '../../shared/types';

type Props = {
  preset: Preset;
  item: StationItem | TrackItem;
  isPlaying: boolean;
  isFavorite: boolean;
  onPlay: () => void;
  onFavorite: () => void;
};

export function PresetCard({ preset, item, isPlaying, isFavorite, onPlay, onFavorite }: Props) {
  const track = 'artist' in item;
  return (
    <article className={`preset-card ${isPlaying ? 'is-playing' : ''}`}>
      <div className={`cover ${track ? 'cover-track' : 'cover-station'}`}>
        {track ? <span>{item.title.slice(0, 1).toUpperCase()}</span> : <Radio size={22} />}
        {isPlaying && <span className="playing-bars" aria-label="正在播放"><i /><i /><i /></span>}
      </div>
      <div className="card-copy">
        <div className="card-eyebrow">{track ? preset.name : 'LIVE RADIO'}</div>
        <h3 title={item.title}>{item.title}</h3>
        <p>{track ? item.artist : `${preset.name} · ${item.codec?.toUpperCase() ?? 'STREAM'}`}</p>
        {track && <span className="license"><ShieldCheck size={12} />{item.license}</span>}
      </div>
      <div className="card-actions">
        <button className={`icon-button favorite-button ${isFavorite ? 'is-favorite' : ''}`} type="button" onClick={onFavorite} aria-label={isFavorite ? '取消收藏' : '收藏'} title={isFavorite ? '取消收藏' : '收藏'}><Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} /></button>
        {track && <a className="icon-button" href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label="打开来源" title="打开来源"><ExternalLink size={14} /></a>}
        <button className={`play-button ${isPlaying ? 'is-playing' : ''}`} type="button" onClick={onPlay} aria-label={isPlaying ? '暂停' : `播放 ${item.title}`} title={isPlaying ? '暂停' : '播放'}>{isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button>
      </div>
    </article>
  );
}
