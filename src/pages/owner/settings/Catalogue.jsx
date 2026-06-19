// /owner/settings/catalogue — Add-On Catalogue Manager
// Owner/admin only. All mutations go through SECURITY DEFINER RPCs.

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, ToggleLeft, ToggleRight, Trash2, History, RotateCcw, Search, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';

const BUCKETS = ['A', 'B', 'C', 'D', 'E'];

const BUCKET_LABELS = {
  A: 'A — Once-off',
  B: 'B — Setup + Retainer',
  C: 'C — Retainer',
  D: 'D — Management fee',
  E: 'E — Referral / Partner',
};

const EMOJI_OPTIONS = ['📦','🤖','🎓','📋','🖨️','📱','👥','🛒','🔍','✉️','🎬','🌐','✍️','📊','💰','🖥️','🔧','💬','⭐','📍','🔑','🚀','💡','🎯','📈','🏆','🎁','🔔','💼','🌟'];

function formatZar(n) {
  if (!n && n !== 0) return '—';
  return `R${Number(n).toLocaleString('en-ZA')}`;
}

function buildPriceLabel(addon) {
  if (addon.price_label) return addon.price_label;
  const s = addon.setup_zar > 0 ? `${formatZar(addon.setup_zar)} setup` : null;
  const m = addon.monthly_zar > 0 ? `${formatZar(addon.monthly_zar)}/mo` : null;
  if (s && m) return `${s} + ${m}`;
  if (s) return s;
  if (m) return m;
  return 'Price TBD';
}

function toSnakeCase(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ─── AddonModal ──────────────────────────────────────────────────────────────

const BLANK = {
  code: '', name: '', emoji: '📦', bucket: 'A',
  setup_zar: 0, monthly_zar: 0, headline: '', description: '',
  term_months: '', price_label: '', commission_note: '', fee_model: '',
};

function AddonModal({ addon, onClose, onSave, isSaving }) {
  const isEdit = !!addon?.code;
  const [form, setForm] = useState(isEdit ? {
    ...BLANK,
    ...addon,
    term_months: addon.term_months ?? '',
  } : BLANK);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const f = (k) => (e) => {
    const v = e.target.value;
    setForm(prev => {
      const next = { ...prev, [k]: v };
      if (k === 'name' && !isEdit) next.code = toSnakeCase(v);
      return next;
    });
  };

  const num = (k) => (e) => setForm(prev => ({ ...prev, [k]: Number(e.target.value) || 0 }));

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.code.trim()) { toast.error('Code is required'); return; }
    if (!/^[a-z][a-z0-9_]*$/.test(form.code)) { toast.error('Code must be lowercase_snake_case'); return; }
    if (!BUCKETS.includes(form.bucket)) { toast.error('Select a valid bucket'); return; }
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (form.setup_zar < 0 || form.monthly_zar < 0) { toast.error('Prices must be non-negative'); return; }
    onSave({
      ...form,
      setup_zar:   Number(form.setup_zar),
      monthly_zar: Number(form.monthly_zar),
      term_months: form.term_months !== '' ? Number(form.term_months) : null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-soft hover:text-white">
          <X size={18} />
        </button>
        <h2 className="font-display text-xl text-gradient mb-5">
          {isEdit ? 'Edit add-on' : 'New add-on'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Emoji + Name */}
          <div className="flex gap-3 items-start">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(p => !p)}
                className="input w-14 text-2xl text-center"
              >
                {form.emoji}
              </button>
              {showEmojiPicker && (
                <div className="absolute left-0 top-full mt-1 z-10 bg-darkbg-800 border border-darkbg-border rounded-lg p-2 grid grid-cols-6 gap-1 shadow-xl">
                  {EMOJI_OPTIONS.map(e => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => { setForm(f => ({ ...f, emoji: e })); setShowEmojiPicker(false); }}
                      className="text-xl p-1 rounded hover:bg-darkbg-700"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input
              required
              placeholder="Add-on name *"
              value={form.name}
              onChange={f('name')}
              className="input flex-1"
            />
          </div>

          {/* Code (read-only on edit) */}
          <div>
            <label className="mb-1 block text-xs text-soft">Code {isEdit && <span className="text-brandred">(permanent — cannot change)</span>}</label>
            <input
              value={form.code}
              onChange={isEdit ? undefined : f('code')}
              readOnly={isEdit}
              className={`input w-full font-mono text-sm ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
              placeholder="auto_generated_from_name"
            />
          </div>

          {/* Bucket */}
          <div>
            <label className="mb-1 block text-xs text-soft">Bucket *</label>
            <select value={form.bucket} onChange={f('bucket')} className="input w-full">
              {BUCKETS.map(b => (
                <option key={b} value={b}>{BUCKET_LABELS[b]}</option>
              ))}
            </select>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-soft">Setup (ZAR)</label>
              <input type="number" min="0" value={form.setup_zar} onChange={num('setup_zar')} className="input w-full" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-soft">Monthly (ZAR)</label>
              <input type="number" min="0" value={form.monthly_zar} onChange={num('monthly_zar')} className="input w-full" />
            </div>
          </div>

          {/* Headline */}
          <input
            placeholder="Headline (1 line summary)"
            value={form.headline}
            onChange={f('headline')}
            className="input w-full"
          />

          {/* Description */}
          <textarea
            placeholder="Description"
            rows={3}
            value={form.description}
            onChange={f('description')}
            className="input w-full resize-none"
          />

          {/* Optional fields */}
          <details className="text-sm">
            <summary className="cursor-pointer text-soft hover:text-white mb-2">Advanced options</summary>
            <div className="space-y-3 mt-2">
              <div>
                <label className="mb-1 block text-xs text-soft">Price label (overrides auto-build)</label>
                <input placeholder={`e.g. "${buildPriceLabel(form)}"`} value={form.price_label} onChange={f('price_label')} className="input w-full" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-soft">Term months</label>
                <input type="number" min="1" value={form.term_months} onChange={f('term_months')} className="input w-full" placeholder="Leave blank = no fixed term" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-soft">Commission note (bucket E / special)</label>
                <input value={form.commission_note} onChange={f('commission_note')} className="input w-full" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-soft">Fee model (bucket D)</label>
                <input value={form.fee_model} onChange={f('fee_model')} className="input w-full" placeholder="e.g. management_fee_on_spend" />
              </div>
            </div>
          </details>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={isSaving} className="btn-primary flex-1">
              {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Add to catalogue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── AuditHistory modal ───────────────────────────────────────────────────────

function AuditModal({ code, onClose, onUndo }) {
  const { data: rows, isLoading } = useQuery({
    queryKey: ['addon_audit', code],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('id, actor_id, action, metadata, created_at, profiles(full_name)')
        .in('action', ['addon_added','addon_edited','addon_deactivated','addon_reactivated','addon_deleted'])
        .contains('metadata', { code })
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const canUndo = (row) => {
    if (!['addon_edited','addon_deactivated','addon_reactivated'].includes(row.action)) return false;
    const age = Date.now() - new Date(row.created_at).getTime();
    return age < 24 * 60 * 60 * 1000;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-soft hover:text-white"><X size={18} /></button>
        <h2 className="font-display text-xl text-gradient mb-4">Audit history — <code className="text-sm">{code}</code></h2>
        {isLoading ? (
          <p className="text-soft text-sm">Loading…</p>
        ) : rows?.length === 0 ? (
          <p className="text-soft text-sm">No history found.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map(row => (
              <li key={row.id} className="rounded-lg border border-darkbg-border bg-darkbg-900/60 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-semibold text-white">{row.action}</span>
                    <span className="ml-2 text-soft">{row.profiles?.full_name ?? 'Unknown'}</span>
                    <p className="mt-0.5 text-xs text-soft/70">{new Date(row.created_at).toLocaleString()}</p>
                  </div>
                  {canUndo(row) && (
                    <button
                      onClick={() => onUndo(row)}
                      className="flex items-center gap-1 rounded border border-brandred/40 px-2 py-1 text-xs text-brandred hover:bg-brandred/10"
                    >
                      <RotateCcw size={12} /> Undo
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <button onClick={onClose} className="btn-secondary mt-4 w-full">Close</button>
      </div>
    </div>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ addon, onClose, onConfirm, isDeleting }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card w-full max-w-sm p-6">
        <h2 className="font-display text-xl text-gradient mb-2">Delete permanently?</h2>
        <p className="text-soft text-sm mb-1">
          This will remove <strong className="text-white">{addon.emoji} {addon.name}</strong> (<code>{addon.code}</code>) from the catalogue.
        </p>
        <p className="text-soft text-sm mb-5">
          If any deals reference this code, the delete will be refused — deactivate instead.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={onConfirm} disabled={isDeleting} className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Catalogue() {
  const qc = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [bucketFilter, setBucketFilter] = useState('');
  const [modal, setModal] = useState(null); // null | { type: 'add'|'edit'|'audit'|'delete', addon? }

  const { data: catalogue = [], isLoading, error } = useQuery({
    queryKey: ['addon_catalogue', showInactive],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('read_addon_catalogue', { include_inactive: showInactive });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    let list = catalogue;
    if (bucketFilter) list = list.filter(a => a.bucket === bucketFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.name?.toLowerCase().includes(q) ||
        a.code?.toLowerCase().includes(q) ||
        a.headline?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [catalogue, bucketFilter, search]);

  const grouped = useMemo(() => {
    const g = { A: [], B: [], C: [], D: [], E: [] };
    filtered.forEach(a => { (g[a.bucket] ?? (g['A'])).push(a); });
    return g;
  }, [filtered]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const upsertMutation = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.rpc('catalogue_upsert_addon', { payload });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, payload) => {
      qc.invalidateQueries({ queryKey: ['addon_catalogue'] });
      toast.success(payload.code && catalogue.find(a => a.code === payload.code)
        ? 'Add-on updated'
        : 'Add-on added to catalogue');
      setModal(null);
    },
    onError: (err) => toast.error(err.message || 'Failed to save add-on'),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (code) => {
      const { data, error } = await supabase.rpc('catalogue_deactivate_addon', { p_code: code });
      if (error) throw error;
      return data;
    },
    onMutate: async (code) => {
      await qc.cancelQueries({ queryKey: ['addon_catalogue'] });
      const prev = qc.getQueryData(['addon_catalogue', showInactive]);
      qc.setQueryData(['addon_catalogue', showInactive], old =>
        (old ?? []).map(a => a.code === code ? { ...a, active: false } : a)
      );
      return { prev };
    },
    onError: (err, _code, ctx) => {
      qc.setQueryData(['addon_catalogue', showInactive], ctx?.prev);
      toast.error(err.message || 'Failed to deactivate');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addon_catalogue'] });
      toast.success('Add-on deactivated');
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (code) => {
      const { data, error } = await supabase.rpc('catalogue_reactivate_addon', { p_code: code });
      if (error) throw error;
      return data;
    },
    onMutate: async (code) => {
      await qc.cancelQueries({ queryKey: ['addon_catalogue'] });
      const prev = qc.getQueryData(['addon_catalogue', showInactive]);
      qc.setQueryData(['addon_catalogue', showInactive], old =>
        (old ?? []).map(a => a.code === code ? { ...a, active: true } : a)
      );
      return { prev };
    },
    onError: (err, _code, ctx) => {
      qc.setQueryData(['addon_catalogue', showInactive], ctx?.prev);
      toast.error(err.message || 'Failed to reactivate');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addon_catalogue'] });
      toast.success('Add-on reactivated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (code) => {
      const { data, error } = await supabase.rpc('catalogue_delete_addon', { p_code: code });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addon_catalogue'] });
      toast.success('Add-on deleted');
      setModal(null);
    },
    onError: (err) => toast.error(err.message || 'Delete refused'),
  });

  // Undo: restore old_value via upsert
  async function handleUndo(auditRow) {
    const oldVal = auditRow.metadata?.old_value;
    if (!oldVal) { toast.error('No previous value to restore'); return; }
    upsertMutation.mutate({ ...oldVal, active: oldVal.active ?? true });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (error) return (
    <div className="p-6 text-red-400">Failed to load catalogue: {error.message}</div>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-gradient">Add-on catalogue</h1>
          <p className="mt-1 text-sm text-soft">{catalogue.length} add-ons · all prices in ZAR</p>
        </div>
        <button
          onClick={() => setModal({ type: 'add' })}
          className="btn-primary flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus size={16} /> New add-on
        </button>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-soft pointer-events-none" />
          <input
            placeholder="Search by name or code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input w-full pl-8"
          />
        </div>
        <select value={bucketFilter} onChange={e => setBucketFilter(e.target.value)} className="input min-w-36">
          <option value="">All buckets</option>
          {BUCKETS.map(b => <option key={b} value={b}>{BUCKET_LABELS[b]}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-soft cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Show inactive
        </label>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-soft">Loading catalogue…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-soft">No add-ons match your filters.</div>
      ) : (
        BUCKETS.filter(b => grouped[b]?.length > 0).map(bucket => (
          <section key={bucket} className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-soft">
              Bucket {BUCKET_LABELS[bucket]}
            </h2>
            <div className="overflow-hidden rounded-xl border border-darkbg-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-darkbg-border bg-darkbg-900/60 text-left text-xs text-soft">
                    <th className="px-4 py-2">Add-on</th>
                    <th className="px-4 py-2 hidden sm:table-cell">Code</th>
                    <th className="px-4 py-2">Price</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[bucket].map((addon, i) => (
                    <tr
                      key={addon.code}
                      className={`border-b border-darkbg-border/50 last:border-0 ${!addon.active ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <span className="mr-2">{addon.emoji}</span>
                        <span className="font-medium text-white">{addon.name}</span>
                        {addon.headline && (
                          <p className="mt-0.5 text-xs text-soft truncate max-w-xs">{addon.headline}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <code className="text-xs text-soft/80">{addon.code}</code>
                      </td>
                      <td className="px-4 py-3 text-soft">{buildPriceLabel(addon)}</td>
                      <td className="px-4 py-3">
                        {addon.active ? (
                          <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-400">Active</span>
                        ) : (
                          <span className="rounded-full bg-darkbg-border px-2 py-0.5 text-xs text-soft">Inactive</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            title="Edit"
                            onClick={() => setModal({ type: 'edit', addon })}
                            className="rounded p-1.5 text-soft hover:bg-darkbg-700 hover:text-white"
                          >
                            <Pencil size={14} />
                          </button>
                          {addon.active ? (
                            <button
                              title="Deactivate"
                              onClick={() => deactivateMutation.mutate(addon.code)}
                              disabled={deactivateMutation.isPending}
                              className="rounded p-1.5 text-soft hover:bg-darkbg-700 hover:text-amber-400"
                            >
                              <ToggleRight size={14} />
                            </button>
                          ) : (
                            <button
                              title="Reactivate"
                              onClick={() => reactivateMutation.mutate(addon.code)}
                              disabled={reactivateMutation.isPending}
                              className="rounded p-1.5 text-soft hover:bg-darkbg-700 hover:text-green-400"
                            >
                              <ToggleLeft size={14} />
                            </button>
                          )}
                          <button
                            title="Audit history"
                            onClick={() => setModal({ type: 'audit', addon })}
                            className="rounded p-1.5 text-soft hover:bg-darkbg-700 hover:text-white"
                          >
                            <History size={14} />
                          </button>
                          <button
                            title="Delete permanently"
                            onClick={() => setModal({ type: 'delete', addon })}
                            className="rounded p-1.5 text-soft hover:bg-darkbg-700 hover:text-red-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {/* Modals */}
      {modal?.type === 'add' && (
        <AddonModal
          addon={null}
          onClose={() => setModal(null)}
          onSave={upsertMutation.mutate}
          isSaving={upsertMutation.isPending}
        />
      )}
      {modal?.type === 'edit' && (
        <AddonModal
          addon={modal.addon}
          onClose={() => setModal(null)}
          onSave={upsertMutation.mutate}
          isSaving={upsertMutation.isPending}
        />
      )}
      {modal?.type === 'audit' && (
        <AuditModal
          code={modal.addon.code}
          onClose={() => setModal(null)}
          onUndo={handleUndo}
        />
      )}
      {modal?.type === 'delete' && (
        <DeleteConfirm
          addon={modal.addon}
          onClose={() => setModal(null)}
          onConfirm={() => deleteMutation.mutate(modal.addon.code)}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
