import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Search, Copy, Heart, ChevronDown, ChevronUp, Zap, AlertTriangle,
  Plus, Pencil, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';

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

const CONTENT_TYPES = [
  { value: 'script',    label: 'Script' },
  { value: 'framework', label: 'Framework' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'template',  label: 'Template' },
];

const ROLES = ['field_agent', 'cpc', 'admin', 'founder', 'head_of_tech', 'driver'];

const TYPE_BADGE = {
  script:    { bg: 'bg-cyan-500/15',    text: 'text-cyan-300',    border: 'border-cyan-500/30'   },
  framework: { bg: 'bg-violet-500/15',  text: 'text-violet-300',  border: 'border-violet-500/30' },
  checklist: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30'},
  template:  { bg: 'bg-orange-500/15',  text: 'text-orange-300',  border: 'border-orange-500/30' },
};

function renderRichText(text) {
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
  const { role } = useAuth();
  const isOwner = role === 'owner';

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [favorites, setFavorites] = useState(new Set());
  const [editor, setEditor] = useState(null); // { mode: 'create'|'edit', playbook? }

  useEffect(() => {
    try {
      const raw = localStorage.getItem('mio_playbook_favorites');
      if (raw) setFavorites(new Set(JSON.parse(raw)));
    } catch (_) { /* allowed: corrupt localStorage; start fresh */ }
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

  const queryClient = useQueryClient();
  const { data: playbooks = [], isLoading, error } = useQuery({
    queryKey: ['playbooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playbooks').select('*').order('category').order('title');
      if (error) throw error;
      return data ?? [];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload) => {
      const isUpdate = !!payload.id;
      const op = isUpdate
        ? supabase.from('playbooks').update(payload).eq('id', payload.id).select().single()
        : supabase.from('playbooks').insert(payload).select().single();
      const { data, error } = await op;
      if (error) throw error;
      return data;
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
      toast.success(vars.id ? 'Playbook updated.' : 'Playbook created.');
      setEditor(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('playbooks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
      toast.success('Playbook deleted.');
    },
    onError: (err) => toast.error(err.message),
  });

  function onDelete(p) {
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    deleteMutation.mutate(p.id);
  }

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
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">
            <span className="text-gradient">Playbooks</span>
          </h1>
          <p className="text-sm text-soft">
            Scripts, frameworks, checklists & templates for the team. {playbooks.length} live.
          </p>
        </div>
        {isOwner && (
          <button onClick={() => setEditor({ mode: 'create' })} className="btn-primary">
            <Plus size={16}/> Add playbook
          </button>
        )}
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
            if (n === 0 && !isOwner) return null;
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

      {favoritesList.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-soft">
            <Heart size={14} className="fill-brandred text-brandred"/> Favorites
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {favoritesList.map((p) => (
              <PlaybookCard
                key={`fav-${p.id}`} playbook={p} expanded={false} compact
                onExpand={() => setExpandedId(p.id)}
                onFavorite={() => toggleFavorite(p.id)}
                onCopy={() => copy(p.full_content)}
                isFavorite isOwner={isOwner}
                onEdit={() => setEditor({ mode: 'edit', playbook: p })}
                onDelete={() => onDelete(p)}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        {filtered.length === 0 ? (
          <div className="card p-8 text-center">
            <BookOpen size={32} className="mx-auto mb-3 text-soft"/>
            <p className="text-soft">No playbooks match the filter.</p>
            {isOwner && (
              <button onClick={() => setEditor({ mode: 'create' })}
                      className="btn-primary mx-auto mt-4">
                <Plus size={16}/> Add your first playbook
              </button>
            )}
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
                isOwner={isOwner}
                onEdit={() => setEditor({ mode: 'edit', playbook: p })}
                onDelete={() => onDelete(p)}
              />
            ))}
          </div>
        )}
      </section>

      {editor && (
        <PlaybookEditor
          mode={editor.mode}
          playbook={editor.playbook}
          onClose={() => setEditor(null)}
          onSave={(payload) => upsertMutation.mutate(payload)}
          saving={upsertMutation.isPending}
        />
      )}
    </div>
  );
}

function PlaybookCard({
  playbook, expanded, onExpand, onFavorite, onCopy, isFavorite, compact,
  isOwner, onEdit, onDelete,
}) {
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
          {isOwner && (
            <>
              <button onClick={onEdit} title="Edit"
                      className="rounded-md p-2 text-soft hover:bg-white/10 hover:text-white">
                <Pencil size={16}/>
              </button>
              <button onClick={onDelete} title="Delete"
                      className="rounded-md p-2 text-soft hover:bg-rose-500/15 hover:text-rose-300">
                <Trash2 size={16}/>
              </button>
            </>
          )}
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

function PlaybookEditor({ mode, playbook, onClose, onSave, saving }) {
  const [form, setForm] = useState(() => ({
    id:                playbook?.id ?? undefined,
    code:              playbook?.code ?? '',
    title:             playbook?.title ?? '',
    category:          playbook?.category ?? CATEGORIES[0].value,
    content_type:      playbook?.content_type ?? 'script',
    visible_to_roles:  playbook?.visible_to_roles ?? ['field_agent', 'cpc', 'admin'],
    short_description: playbook?.short_description ?? '',
    full_content:      playbook?.full_content ?? '',
    related_objection: playbook?.related_objection ?? '',
    usage_notes:       playbook?.usage_notes ?? '',
    is_favorite_eligible: playbook?.is_favorite_eligible ?? true,
  }));

  const set = (k) => (e) => setForm((f) => ({
    ...f,
    [k]: e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e),
  }));

  function toggleRole(role) {
    setForm((f) => ({
      ...f,
      visible_to_roles: f.visible_to_roles.includes(role)
        ? f.visible_to_roles.filter((r) => r !== role)
        : [...f.visible_to_roles, role],
    }));
  }

  function submit(e) {
    e.preventDefault();
    if (!form.code.trim())  return toast.error('Code is required (unique slug, e.g. "obj_no_money").');
    if (!form.title.trim()) return toast.error('Title is required.');
    if (!form.short_description.trim()) return toast.error('Short description is required.');
    if (!form.full_content.trim()) return toast.error('Full content is required.');
    if (form.visible_to_roles.length === 0) return toast.error('Pick at least one role.');

    const payload = {
      ...form,
      code: form.code.trim(),
      title: form.title.trim(),
      short_description: form.short_description.trim(),
      full_content: form.full_content,
      related_objection: form.related_objection.trim() || null,
      usage_notes: form.usage_notes.trim() || null,
    };
    onSave(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <form onSubmit={submit}
            className="card my-8 w-full max-w-2xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl">
            <span className="text-gradient">
              {mode === 'create' ? 'New playbook' : 'Edit playbook'}
            </span>
          </h2>
          <button type="button" onClick={onClose}
                  className="rounded-md p-2 text-soft hover:bg-white/10 hover:text-white">
            <X size={18}/>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Code (unique slug)</label>
            <input className="input" required value={form.code} onChange={set('code')}
                   placeholder="e.g. obj_no_money" disabled={mode === 'edit'}/>
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={set('category')}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label className="label">Title</label>
          <input className="input" required value={form.title} onChange={set('title')}/>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label">Content type</label>
            <select className="input" value={form.content_type} onChange={set('content_type')}>
              {CONTENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Related objection (optional)</label>
            <input className="input" value={form.related_objection} onChange={set('related_objection')}
                   placeholder='e.g. "I’ll think about it"'/>
          </div>
        </div>

        <div className="mt-3">
          <label className="label">Short description</label>
          <input className="input" required value={form.short_description}
                 onChange={set('short_description')}/>
        </div>

        <div className="mt-3">
          <label className="label">Full content (**bold** + multi-line)</label>
          <textarea className="input min-h-[180px]" required value={form.full_content}
                    onChange={set('full_content')} rows={10}/>
        </div>

        <div className="mt-3">
          <label className="label">Usage notes (optional)</label>
          <textarea className="input" value={form.usage_notes} onChange={set('usage_notes')} rows={2}
                    placeholder="When to use this, what NOT to do…"/>
        </div>

        <div className="mt-3">
          <label className="label">Visible to roles</label>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => {
              const on = form.visible_to_roles.includes(r);
              return (
                <button type="button" key={r} onClick={() => toggleRole(r)}
                        className={`rounded-full border px-3 py-1 text-xs uppercase tracking-widest transition ${
                          on
                            ? 'border-brandred bg-brandred/15 text-white'
                            : 'border-darkbg-border text-soft hover:bg-darkbg-border/40'
                        }`}>
                  {r.replace('_', ' ')}
                </button>
              );
            })}
          </div>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-soft">
          <input type="checkbox" checked={form.is_favorite_eligible} onChange={set('is_favorite_eligible')}
                 className="accent-brandred"/>
          Staff can favourite this playbook
        </label>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : (mode === 'create' ? 'Create playbook' : 'Save changes')}
          </button>
        </div>
      </form>
    </div>
  );
}
