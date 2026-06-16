import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen, Search, Copy, Heart, ChevronDown, ChevronUp, Zap, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase.js';

const CATEGORIES = [
  { value: 'cold_outreach',     label: 'Cold Outreach',    color: '#22d3ee' },
  { value: 'discovery',         label: 'Discovery',        color: '#a78bfa' },
  { value: 'objection_handler', label: 'Objections',       color: '#fb7185' },
  { value: 'closing',           label: 'Closing',          color: '#34d399' },
  { value: 'follow_up',         label: 'Follow-ups',       color: '#fbbf24' },
  { value: 'upsell',            label: 'Upsells',          color: '#f472b6' },
  { value: 'escalation',        label: 'Escalation',       color: '#fb923c' },
  { value: 'daily_routine',     label: 'Daily Routines',   color: '#60a5fa' },
];

const TYPE_BADGE = {
  script:    { bg: 'bg-cyan-500/15',    text: 'text-cyan-300',    border: 'border-cyan-500/30'   },
  framework: { bg: 'bg-violet-500/15',  text: 'text-violet-300',  border: 'border-violet-500/30' },
  checklist: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30'},
  template:  { bg: 'bg-orange-500/15',  text: 'text-orange-300',  border: 'border-orange-500/30' },
};

function renderRichText(text) {
  // Simple markdown-ish render: **bold** + newlines
  const lines = String(text || '').split('\n');
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={j} className="text-white">{p.slice(2, -2)}</strong>
        : <span key={j}>{p}</span>
    );
    return <p key={i} className={line.trim() ? 'mb-2' : 'mb-2 h-2'}>{parts}</p>;
  });
}

export default function Playbooks() {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [favorites, setFavorites] = useState(new Set());

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('mio_playbook_favorites');
      if (raw) setFavorites(new Set(JSON.parse(raw)));
    } catch (_) {/* allowed: localStorage corrupt; start fresh */}
  }, []);

  function toggleFavorite(id) {
    setFavorites((curr) => {
      const next = new Set(curr);
      next.has(id) ? next.delete(id) : next.add(id);
      try {
        localStorage.setItem('mio_playbook_favorites', JSON.stringify([...next]));
      } catch (err) {
        toast.error('Could not save favorite locally.');
        throw err;
      }
      return next;
    });
  }

  function copy(content) {
    navigator.clipboard.writeText(content).then(
      () => toast.success('Copied to clipboard.'),
      (err) => toast.error(`Copy failed: ${err.message}`),
    );
  }

  const { data: playbooks = [], isLoading, error } = useQuery({
    queryKey: ['playbooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playbooks').select('*').order('category').order('title');
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    let list = playbooks;
    if (selectedCategory) list = list.filter((p) => p.category === selectedCategory);
    if (query.trim()) {
      const q = query.toLowerCase().trim();
      list = list.filter((p) =>
        (p.title || '').toLowerCase().includes(q)
        || (p.short_description || '').toLowerCase().includes(q)
        || (p.full_content || '').toLowerCase().includes(q)
        || (p.related_objection || '').toLowerCase().includes(q)
        || (p.category || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [playbooks, selectedCategory, query]);

  const favoritesList = useMemo(
    () => playbooks.filter((p) => favorites.has(p.id)),
    [playbooks, favorites],
  );

  if (isLoading) return <div className="text-soft">Loading playbooks…</div>;
  if (error) return (
    <div className="card p-6 text-rose-300">
      <p className="mb-2 flex items-center gap-2"><AlertTriangle size={18}/> Couldn't load playbooks</p>
      <p className="text-sm">{error.message}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl">
            <span className="text-gradient">Playbooks</span>
          </h1>
          <p className="text-sm text-soft">
            Scripts, frameworks, checklists & templates for the team. {playbooks.length} live.
          </p>
        </div>
      </header>

      {/* Search */}
      <div className="card p-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-soft"/>
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            className="input pl-9"
            placeholder="Search by title, script content, or objection…"
          />
        </div>

        {/* Category pills */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setSelectedCategory(null)}
                  className={`rounded-full border px-3 py-1 text-xs uppercase tracking-widest transition ${
                    selectedCategory === null
                      ? 'border-brandred bg-brandred/15 text-white'
                      : 'border-darkbg-border text-soft hover:bg-darkbg-border/40'
                  }`}>
            All <span className="ml-1 text-[10px] opacity-70">{playbooks.length}</span>
          </button>
          {CATEGORIES.map((c) => {
            const n = playbooks.filter((p) => p.category === c.value).length;
            if (n === 0) return null;
            const active = selectedCategory === c.value;
            return (
              <button
                key={c.value} onClick={() => setSelectedCategory(active ? null : c.value)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs uppercase tracking-widest transition ${
                  active
                    ? 'border-white/40 bg-white/10 text-white'
                    : 'border-darkbg-border text-soft hover:bg-darkbg-border/40'
                }`}
                style={active ? { boxShadow: `0 0 0 1px ${c.color}66` } : undefined}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }}/>
                {c.label} <span className="text-[10px] opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Favorites strip */}
      {favoritesList.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-soft">
            <Heart size={14} className="fill-brandred text-brandred"/> Favorites
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {favoritesList.map((p) => (
              <PlaybookCard
                key={`fav-${p.id}`} playbook={p} expanded={false}
                onExpand={() => setExpandedId(p.id)}
                onFavorite={() => toggleFavorite(p.id)}
                onCopy={() => copy(p.full_content)}
                isFavorite compact
              />
            ))}
          </div>
        </section>
      )}

      {/* Main list */}
      <section>
        {filtered.length === 0 ? (
          <div className="card p-8 text-center">
            <BookOpen size={32} className="mx-auto mb-3 text-soft"/>
            <p className="text-soft">No playbooks match the filter.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => (
              <PlaybookCard
                key={p.id} playbook={p}
                expanded={expandedId === p.id}
                onExpand={() => setExpandedId(expandedId === p.id ? null : p.id)}
                onFavorite={() => toggleFavorite(p.id)}
                onCopy={() => copy(p.full_content)}
                isFavorite={favorites.has(p.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PlaybookCard({ playbook, expanded, onExpand, onFavorite, onCopy, isFavorite, compact }) {
  const cat = CATEGORIES.find((c) => c.value === playbook.category);
  const badge = TYPE_BADGE[playbook.content_type] ?? TYPE_BADGE.script;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${badge.bg} ${badge.text} ${badge.border}`}>
              {playbook.content_type}
            </span>
            {cat && (
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-soft">
                <span className="h-2 w-2 rounded-full" style={{ background: cat.color }}/>
                {cat.label}
              </span>
            )}
          </div>
          <h3 className="font-display text-lg leading-snug text-white">{playbook.title}</h3>
          {playbook.short_description && (
            <p className="mt-1 text-sm text-soft">{playbook.short_description}</p>
          )}
          {playbook.related_objection && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-brandred/10 px-2 py-0.5 text-xs text-brandred">
              <Zap size={12}/> Handles: "{playbook.related_objection}"
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {playbook.is_favorite_eligible && (
            <button onClick={onFavorite} title={isFavorite ? 'Remove favorite' : 'Save favorite'}
                    className="rounded-md p-2 text-soft hover:bg-white/10 hover:text-white">
              <Heart size={16} className={isFavorite ? 'fill-brandred text-brandred' : ''}/>
            </button>
          )}
          <button onClick={onCopy} title="Copy content"
                  className="rounded-md p-2 text-soft hover:bg-white/10 hover:text-white">
            <Copy size={16}/>
          </button>
          {!compact && (
            <button onClick={onExpand} title={expanded ? 'Collapse' : 'Expand'}
                    className="rounded-md p-2 text-soft hover:bg-white/10 hover:text-white">
              {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
            </button>
          )}
        </div>
      </div>

      {expanded && !compact && (
        <div className="mt-4 border-t border-darkbg-border pt-4 text-sm leading-relaxed text-white/90">
          {renderRichText(playbook.full_content)}
        </div>
      )}
    </div>
  );
}
