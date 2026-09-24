import { Headphones, Heart, Library, Radio, Sparkles, Waves } from 'lucide-react';

export type ViewId = 'recommended' | 'stations' | 'tracks' | 'favorites';

const NAV_ITEMS: Array<{ id: ViewId; label: string; icon: typeof Sparkles }> = [
  { id: 'recommended', label: '推荐', icon: Sparkles },
  { id: 'stations', label: '电台', icon: Radio },
  { id: 'tracks', label: '单曲', icon: Headphones },
  { id: 'favorites', label: '收藏', icon: Heart },
];

export function Sidebar({ view, onChange }: { view: ViewId; onChange: (view: ViewId) => void }) {
  return (
    <aside className="sidebar">
      <div className="brand-mark"><Waves size={16} strokeWidth={2.5} /><span>FAK MUSIC</span></div>
      <p className="sidebar-label">你的音乐空间</p>
      <nav aria-label="音乐视图">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button className={`nav-item ${view === id ? 'is-active' : ''}`} key={id} onClick={() => onChange(id)} type="button">
            <Icon size={16} aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer"><Library size={14} /><span>自动更新目录</span><span className="live-dot" /></div>
    </aside>
  );
}
