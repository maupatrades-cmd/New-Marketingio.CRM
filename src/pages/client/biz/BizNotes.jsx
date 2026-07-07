import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pin, PinOff, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase.js';
import MascotGuide from '../../../components/MascotGuide.jsx';

const COLORS = [
  { key: 'default', bg: 'bg-white',      border: 'border-gray-200' },
  { key: 'yellow',  bg: 'bg-amber-50',   border: 'border-amber-200' },
  { key: 'blue',    bg: 'bg-sky-50',     border: 'border-sky-200' },
  { key: 'green',   bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { key: 'red',     bg: 'bg-red-50',     border: 'border-red-200' },
  { key: 'purple',  bg: 'bg-purple-50',  border: 'border-purple-200' },
];
const colorFor = (k) => COLORS.find(c => c.key === k) || COLORS[0];

export default function BizNotes() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // null | 'new' | note object

  const notesQ = useQuery({
    queryKey: ['biz-notes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('biz_get_notes');
      if (error) throw error;
      return data?.notes ?? [];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (note) => {
      const { data, error } = await supabase.rpc('biz_save_note', { p_payload: note });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['biz-notes'] }); setEditing(null); },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      const { data, error } = await supabase.rpc('biz_delete_note', { p_id: id });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['biz-notes'] }); toast.success('Deleted.'); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-[#0B2143]">Notes</h1>
          <p className="text-sm text-gray-500 mt-1">Quick reminders, ideas, and to-dos.</p>
        </div>
        <button onClick={() => setEditing({ title: '', body: '', color: 'yellow', is_pinned: false })}
                className="inline-flex items-center gap-2 rounded-xl bg-[#E2293B] text-white px-4 py-2 text-sm font-semibold hover:bg-red-600 transition">
          <Plus size={16} /> New note
        </button>
      </header>

      {notesQ.isLoading ? (
        <div className="py-12"><MascotGuide phase="thinking" size={80} message="Loading notes..." position="inline" /></div>
      ) : (notesQ.data ?? []).length === 0 ? (
        <div className="py-12"><MascotGuide phase="guide" size={100} message="No notes yet — jot something down." position="inline" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(notesQ.data ?? []).map(n => {
            const c = colorFor(n.color);
            return (
              <div key={n.id} className={`rounded-2xl border ${c.border} ${c.bg} shadow-sm p-4 relative group`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-bold text-[#0B2143] flex-1">{n.title || 'Untitled'}</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => saveMut.mutate({ id: n.id, is_pinned: !n.is_pinned })}
                            className="opacity-50 group-hover:opacity-100 transition">
                      {n.is_pinned ? <Pin size={14} className="text-red-500 fill-red-500" /> : <PinOff size={14} className="text-gray-400" />}
                    </button>
                    <button onClick={() => { if (confirm('Delete this note?')) deleteMut.mutate(n.id); }}
                            className="opacity-50 group-hover:opacity-100 transition">
                      <Trash2 size={14} className="text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                </div>
                <button onClick={() => setEditing(n)} className="block text-left w-full">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-6">{n.body}</p>
                </button>
                <div className="mt-3 flex items-center justify-between text-[10px] text-gray-400">
                  <span>{n.category || ''}</span>
                  <span>{new Date(n.updated_at).toLocaleDateString('en-ZA')}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <NoteEditor note={editing} onClose={() => setEditing(null)} onSave={(n) => saveMut.mutate(n)} saving={saveMut.isPending} />}
    </div>
  );
}

function NoteEditor({ note, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    id: note.id,
    title: note.title || '',
    body: note.body || '',
    color: note.color || 'yellow',
    is_pinned: note.is_pinned || false,
    category: note.category || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-display text-lg text-[#0B2143]">{note.id ? 'Edit note' : 'New note'}</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Title"
                 className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-200" />
          <textarea value={form.body} onChange={e => set('body', e.target.value)} placeholder="Note..." rows={6}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
          <input value={form.category} onChange={e => set('category', e.target.value)} placeholder="Category (optional)"
                 className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-200" />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-500">Color:</span>
            {COLORS.map(c => (
              <button key={c.key} type="button" onClick={() => set('color', c.key)}
                      className={`h-7 w-7 rounded-full border-2 ${c.bg} ${c.border} ${form.color === c.key ? 'ring-2 ring-[#E2293B]' : ''}`} />
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.is_pinned} onChange={e => set('is_pinned', e.target.checked)} />
            Pin to top
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={() => onSave(form)} disabled={saving}
                    className="rounded-xl bg-[#E2293B] text-white px-4 py-2 text-sm font-semibold hover:bg-red-600 transition disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
