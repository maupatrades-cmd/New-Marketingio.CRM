import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Search, SlidersHorizontal, ChevronUp, ChevronDown, ChevronsUpDown,
  Download, BarChart2, X, Check, Flame, Thermometer, Snowflake,
  Ticket, AlertTriangle, Clock, ChevronLeft, ChevronRight,
  Bookmark, BookmarkPlus, Share2, Users, Tag, Trash2,
  RefreshCw, Eye, EyeOff, PanelRightOpen, PanelRightClose,
  TrendingUp, MapPin, Activity,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

// ─── Constants ────────────────────────────────────────────────────────────────

const MANAGER_ROLES = ['owner', 'admin', 'head_of_tech'];
const PAGE_SIZE = 50;

const SOURCE_OPTIONS = [
  'cpc_outbound', 'field_visit', 'referral', 'online_form',
  'cold_call', 'walk_in', 'partner', 'other',
];

const STATUS_OPTIONS = ['pending', 'verified', 'rejected', 'converted'];
const TEMP_OPTIONS   = ['hot', 'warm', 'cold'];

const EMPTY_FILTERS = {
  status: [],
  temperature: [],
  source: '',
  assignedTo: '',
  submittedBy: '',
  dateFrom: '',
  dateTo: '',
  tags: '',
  area: '',
  hasOpenTickets: false,
  unverifiedOnly: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ageDays(iso) { return (Date.now() - new Date(iso).getTime()) / 86_400_000; }

function fmtAge(iso) {
  const d = ageDays(iso);
  if (d < 1)  return `${Math.max(1, Math.round(d * 24))}h`;
  return `${Math.round(d)}d`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: '2-digit' });
}

function fmtZAR(val) {
  if (val == null) return '—';
  return `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function filtersToRpcArgs(filters, search, sort, page, userId) {
  return {
    p_search:           search || null,
    p_status:           filters.status.length    ? filters.status    : null,
    p_temperature:      filters.temperature.length ? filters.temperature : null,
    p_source:           filters.source           || null,
    p_assigned_to:      filters.assignedTo === '__CURRENT_USER__' ? userId : (filters.assignedTo || null),
    p_submitted_by:     filters.submittedBy      || null,
    p_date_from:        filters.dateFrom         || null,
    p_date_to:          filters.dateTo           || null,
    p_tags:             filters.tags             || null,
    p_area:             filters.area             || null,
    p_has_open_tickets: filters.hasOpenTickets   || null,
    p_unverified_only:  filters.unverifiedOnly   || false,
    p_sort_col:         sort.col,
    p_sort_dir:         sort.dir,
    p_limit:            PAGE_SIZE,
    p_offset:           page * PAGE_SIZE,
  };
}

function downloadCsv(text, filename) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function filtersAreEmpty(f) {
  return (
    f.status.length === 0 && f.temperature.length === 0 &&
    !f.source && !f.assignedTo && !f.submittedBy &&
    !f.dateFrom && !f.dateTo && !f.tags && !f.area &&
    !f.hasOpenTickets && !f.unverifiedOnly
  );
}

// ─── Badge atoms ──────────────────────────────────────────────────────────────

function TempBadge({ temp }) {
  if (!temp || temp === 'cold')
    return <span className="inline-flex items-center gap-1 text-[10px] text-blue-400"><Snowflake size={9}/> Cold</span>;
  if (temp === 'warm')
    return <span className="inline-flex items-center gap-1 text-[10px] text-amber-400"><Thermometer size={9}/> Warm</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400"><Flame size={9}/> Hot</span>;
}

function StatusBadge({ status }) {
  const map = {
    pending:   'bg-amber-500/15 text-amber-400 ring-amber-500/30',
    verified:  'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
    rejected:  'bg-red-500/15 text-red-400 ring-red-500/30',
    converted: 'bg-purple-500/15 text-purple-400 ring-purple-500/30',
  };
  const label = status ? status.replace(/_/g,' ') : '—';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ring-1 ${map[status] ?? 'bg-darkbg-700 text-soft ring-darkbg-border'}`}>
      {label}
    </span>
  );
}

function AgeBadge({ iso }) {
  const d = ageDays(iso);
  if (d >= 7)  return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400 ring-1 ring-red-500/30"><AlertTriangle size={8}/> {fmtAge(iso)}</span>;
  if (d >= 3)  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400 ring-1 ring-amber-500/30"><Clock size={8}/> {fmtAge(iso)}</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400 ring-1 ring-emerald-500/30">{fmtAge(iso)}</span>;
}

// ─── StatsBar ─────────────────────────────────────────────────────────────────

function StatsBar({ leads, total, isLoading }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-darkbg-700/40" />
        ))}
      </div>
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const newToday   = leads.filter(l => l.created_at?.slice(0, 10) === todayStr).length;
  const verified   = leads.filter(l => l.status === 'verified').length;
  const hot        = leads.filter(l => l.lead_temperature === 'hot').length;
  const rejected   = leads.filter(l => l.status === 'rejected').length;

  const stats = [
    { label: 'Total',    value: total,    cls: 'text-white'       },
    { label: 'New Today', value: newToday, cls: newToday > 0 ? 'text-emerald-400' : 'text-white' },
    { label: 'Verified', value: verified,  cls: 'text-emerald-400' },
    { label: 'Hot',      value: hot,       cls: hot > 0 ? 'text-red-400' : 'text-white' },
    { label: 'Rejected', value: rejected,  cls: rejected > 0 ? 'text-amber-400' : 'text-white' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {stats.map(s => (
        <div key={s.label} className="flex flex-col items-center rounded-xl border border-darkbg-border bg-darkbg-800/60 px-4 py-3 text-center">
          <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
          <p className="mt-0.5 text-[9px] uppercase tracking-widest text-soft">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── FilterPanel ──────────────────────────────────────────────────────────────

function FilterPanel({ filters, setFilters, staff, open }) {
  if (!open) return null;

  function toggle(field, val) {
    setFilters(f => {
      const arr = f[field];
      return { ...f, [field]: arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val] };
    });
  }

  function set(field, val) {
    setFilters(f => ({ ...f, [field]: val }));
  }

  const chipBase = 'rounded-full border px-3 py-1 text-xs font-semibold transition cursor-pointer select-none';
  const chipActive = 'border-brandred bg-brandred/15 text-white';
  const chipInactive = 'border-darkbg-border bg-darkbg-800/60 text-soft hover:text-white';

  return (
    <div className="rounded-xl border border-darkbg-border bg-darkbg-800/40 p-4 space-y-4">
      {/* Status + Temperature chips */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-soft/60">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map(s => (
              <button key={s} onClick={() => toggle('status', s)}
                className={`${chipBase} ${filters.status.includes(s) ? chipActive : chipInactive}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-soft/60">Temperature</p>
          <div className="flex flex-wrap gap-1.5">
            {TEMP_OPTIONS.map(t => (
              <button key={t} onClick={() => toggle('temperature', t)}
                className={`${chipBase} ${filters.temperature.includes(t) ? chipActive : chipInactive}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Dropdowns row */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-soft/60">Source</label>
          <select value={filters.source} onChange={e => set('source', e.target.value)}
            className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-xs text-white focus:border-brandred focus:outline-none">
            <option value="">All sources</option>
            {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-soft/60">Assigned To</label>
          <select value={filters.assignedTo} onChange={e => set('assignedTo', e.target.value)}
            className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-xs text-white focus:border-brandred focus:outline-none">
            <option value="">All staff</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-soft/60">Submitted By</label>
          <select value={filters.submittedBy} onChange={e => set('submittedBy', e.target.value)}
            className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-xs text-white focus:border-brandred focus:outline-none">
            <option value="">All staff</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
      </div>

      {/* Date range + text inputs */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-soft/60">From</label>
          <input type="date" value={filters.dateFrom} onChange={e => set('dateFrom', e.target.value)}
            className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-xs text-white focus:border-brandred focus:outline-none [color-scheme:dark]" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-soft/60">To</label>
          <input type="date" value={filters.dateTo} onChange={e => set('dateTo', e.target.value)}
            className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-xs text-white focus:border-brandred focus:outline-none [color-scheme:dark]" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-soft/60">Tag</label>
          <input type="text" value={filters.tags} onChange={e => set('tags', e.target.value)}
            placeholder="exact tag"
            className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-xs text-white placeholder:text-soft/40 focus:border-brandred focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-soft/60">Area</label>
          <input type="text" value={filters.area} onChange={e => set('area', e.target.value)}
            placeholder="suburb/area"
            className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-xs text-white placeholder:text-soft/40 focus:border-brandred focus:outline-none" />
        </div>
      </div>

      {/* Checkboxes */}
      <div className="flex flex-wrap gap-6">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-soft">
          <input type="checkbox" checked={filters.hasOpenTickets} onChange={e => set('hasOpenTickets', e.target.checked)}
            className="accent-brandred h-3.5 w-3.5 rounded" />
          Has open tickets
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-soft">
          <input type="checkbox" checked={filters.unverifiedOnly} onChange={e => set('unverifiedOnly', e.target.checked)}
            className="accent-brandred h-3.5 w-3.5 rounded" />
          Unverified only
        </label>
      </div>
    </div>
  );
}

// ─── SavedViewsSidebar ────────────────────────────────────────────────────────

function SavedViewsSidebar({ views, activeViewId, onApply, onSaveNew, userId }) {
  return (
    <div className="flex w-44 shrink-0 flex-col gap-1">
      <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-soft/50">Saved Views</p>
      {views.map(v => {
        const isActive = v.id === activeViewId;
        return (
          <button
            key={v.id}
            onClick={() => onApply(v, userId)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${
              isActive
                ? 'bg-brandred/15 border border-brandred/40 text-white font-semibold'
                : 'border border-transparent text-soft hover:border-darkbg-border hover:bg-darkbg-800/60 hover:text-white'
            }`}
          >
            {v.icon && <span className="text-sm leading-none">{v.icon}</span>}
            <span className="truncate">{v.name}</span>
            {v.is_shared && !v.is_default && (
              <Share2 size={9} className="ml-auto shrink-0 text-soft/40" />
            )}
          </button>
        );
      })}
      <button
        onClick={onSaveNew}
        className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-darkbg-border px-3 py-2 text-xs text-soft transition hover:border-brandred/40 hover:text-white"
      >
        <BookmarkPlus size={11}/> Save current view
      </button>
    </div>
  );
}

// ─── BulkToolbar ─────────────────────────────────────────────────────────────

function BulkToolbar({ selectedIds, onClear, onVerify, onReject, onAssign, onSetTemp, onAddTag, onExport, staff }) {
  const count = selectedIds.size;
  const tooMany = count > 100;
  const [assignOpen, setAssignOpen]   = useState(false);
  const [tempOpen,   setTempOpen]     = useState(false);
  const [tagInput,   setTagInput]     = useState('');
  const [tagOpen,    setTagOpen]      = useState(false);

  if (count === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brandred/30 bg-brandred/10 px-4 py-2.5">
      <span className="text-xs font-bold text-white">
        {count} selected {tooMany && <span className="text-red-400">(max 100 for bulk ops)</span>}
      </span>
      <button onClick={onClear} className="ml-1 rounded p-0.5 text-soft hover:text-white"><X size={12}/></button>

      <div className="ml-2 h-4 w-px bg-darkbg-border" />

      <button onClick={onVerify} disabled={tooMany}
        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-40">
        <Check size={11}/> Verify
      </button>

      <button onClick={onReject} disabled={tooMany}
        className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-40">
        <X size={11}/> Reject
      </button>

      {/* Assign dropdown */}
      <div className="relative">
        <button onClick={() => { setAssignOpen(v => !v); setTempOpen(false); setTagOpen(false); }}
          disabled={tooMany}
          className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-400 transition hover:bg-blue-500/20 disabled:opacity-40">
          <Users size={11}/> Assign <ChevronDown size={9}/>
        </button>
        {assignOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setAssignOpen(false)} />
            <div className="absolute left-0 top-full z-50 mt-1 max-h-52 w-52 overflow-y-auto rounded-xl border border-darkbg-border bg-darkbg-800 shadow-2xl">
              {staff.map(s => (
                <button key={s.id} onClick={() => { onAssign(s.id); setAssignOpen(false); }}
                  className="flex w-full px-3 py-2 text-left text-xs text-soft hover:bg-darkbg-700 hover:text-white">
                  {s.full_name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Set temperature */}
      <div className="relative">
        <button onClick={() => { setTempOpen(v => !v); setAssignOpen(false); setTagOpen(false); }}
          disabled={tooMany}
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-40">
          <Thermometer size={11}/> Temp <ChevronDown size={9}/>
        </button>
        {tempOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setTempOpen(false)} />
            <div className="absolute left-0 top-full z-50 mt-1 w-36 rounded-xl border border-darkbg-border bg-darkbg-800 shadow-2xl">
              {TEMP_OPTIONS.map(t => (
                <button key={t} onClick={() => { onSetTemp(t); setTempOpen(false); }}
                  className="flex w-full px-3 py-2 text-left text-xs capitalize text-soft hover:bg-darkbg-700 hover:text-white">
                  {t}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add tag */}
      <div className="relative">
        <button onClick={() => { setTagOpen(v => !v); setAssignOpen(false); setTempOpen(false); }}
          disabled={tooMany}
          className="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-[11px] font-semibold text-purple-400 transition hover:bg-purple-500/20 disabled:opacity-40">
          <Tag size={11}/> Tag
        </button>
        {tagOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setTagOpen(false)} />
            <div className="absolute left-0 top-full z-50 mt-1 flex gap-1 rounded-xl border border-darkbg-border bg-darkbg-800 p-2 shadow-2xl">
              <input
                autoFocus
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim()) { onAddTag(tagInput.trim()); setTagInput(''); setTagOpen(false); } }}
                placeholder="tag name"
                className="w-32 rounded-md border border-darkbg-border bg-darkbg-900 px-2 py-1 text-xs text-white placeholder:text-soft/40 focus:border-brandred focus:outline-none"
              />
              <button onClick={() => { if (tagInput.trim()) { onAddTag(tagInput.trim()); setTagInput(''); setTagOpen(false); } }}
                className="rounded-md bg-purple-500/20 px-2 text-purple-400 hover:bg-purple-500/30">
                <Check size={11}/>
              </button>
            </div>
          </>
        )}
      </div>

      <button onClick={onExport}
        className="inline-flex items-center gap-1 rounded-md border border-darkbg-border bg-darkbg-800/60 px-2.5 py-1 text-[11px] text-soft transition hover:text-white">
        <Download size={11}/> Export
      </button>
    </div>
  );
}

// ─── LeadsTable ───────────────────────────────────────────────────────────────

function SortIcon({ col, sort }) {
  if (sort.col !== col) return <ChevronsUpDown size={11} className="text-soft/30" />;
  return sort.dir === 'asc'
    ? <ChevronUp size={11} className="text-brandred" />
    : <ChevronDown size={11} className="text-brandred" />;
}

const COLUMNS = [
  { key: 'business_name',      label: 'Business',       sortable: true  },
  { key: 'contact_name',       label: 'Contact',        sortable: false },
  { key: 'phone',              label: 'Phone',          sortable: false },
  { key: 'source',             label: 'Source',         sortable: false },
  { key: 'lead_temperature',   label: 'Temp',           sortable: true  },
  { key: 'status',             label: 'Status',         sortable: true  },
  { key: 'estimated_value_zar',label: 'Value',          sortable: true  },
  { key: 'assigned_to_name',   label: 'Assigned To',    sortable: false },
  { key: 'submitted_by_name',  label: 'Submitted By',   sortable: false },
  { key: 'created_at',         label: 'Age',            sortable: true  },
  { key: 'last_activity_at',   label: 'Last Activity',  sortable: true  },
  { key: 'open_ticket_count',  label: 'Tickets',        sortable: true  },
];

function LeadsTable({ leads, sort, onSort, selectedIds, onToggleRow, onToggleAll, onRowClick, isLoading }) {
  const allSelected = leads.length > 0 && leads.every(l => selectedIds.has(l.id));
  const someSelected = leads.some(l => selectedIds.has(l.id));

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-darkbg-700/40" />
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/40 py-16 text-center">
        <Search size={28} className="mx-auto mb-3 text-soft/30" />
        <p className="font-display text-base text-white">No leads found</p>
        <p className="mt-1 text-sm text-soft">Try adjusting your filters or search.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-darkbg-border">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-darkbg-border bg-darkbg-800/80">
            <th className="px-3 py-3 text-left">
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={() => onToggleAll(leads)}
                className="accent-brandred h-3.5 w-3.5 cursor-pointer rounded"
              />
            </th>
            {COLUMNS.map(col => (
              <th key={col.key}
                className={`whitespace-nowrap px-3 py-3 text-left font-semibold uppercase tracking-widest text-soft/60 ${col.sortable ? 'cursor-pointer select-none hover:text-white' : ''}`}
                onClick={() => col.sortable && onSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && <SortIcon col={col.key} sort={sort} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, idx) => (
            <tr
              key={lead.id}
              onClick={() => onRowClick(lead.id)}
              className={`cursor-pointer border-b border-darkbg-border/50 transition hover:bg-darkbg-700/40 ${
                selectedIds.has(lead.id) ? 'bg-brandred/5' : idx % 2 === 0 ? 'bg-darkbg-800/20' : ''
              }`}
            >
              <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(lead.id)}
                  onChange={() => onToggleRow(lead.id)}
                  className="accent-brandred h-3.5 w-3.5 cursor-pointer rounded"
                />
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 font-semibold text-white">
                {lead.business_name || '—'}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-soft">
                {lead.contact_name || '—'}
              </td>
              <td className="px-3 py-2.5 text-soft">
                {lead.phone
                  ? <a href={`tel:${lead.phone}`} onClick={e => e.stopPropagation()} className="text-blue-400 hover:underline">{lead.phone}</a>
                  : '—'
                }
              </td>
              <td className="px-3 py-2.5 text-soft capitalize">
                {lead.source?.replace(/_/g, ' ') || '—'}
              </td>
              <td className="px-3 py-2.5">
                <TempBadge temp={lead.lead_temperature} />
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge status={lead.status} />
              </td>
              <td className="px-3 py-2.5 text-soft">
                {fmtZAR(lead.estimated_value_zar)}
              </td>
              <td className="max-w-[110px] truncate px-3 py-2.5 text-soft">
                {lead.assigned_to_name || <span className="text-soft/30">Unassigned</span>}
              </td>
              <td className="max-w-[110px] truncate px-3 py-2.5 text-soft">
                {lead.submitted_by_name || '—'}
              </td>
              <td className="px-3 py-2.5">
                <AgeBadge iso={lead.created_at} />
              </td>
              <td className="px-3 py-2.5 text-soft">
                {lead.last_activity_at ? fmtDate(lead.last_activity_at) : '—'}
              </td>
              <td className="px-3 py-2.5">
                {(lead.open_ticket_count ?? 0) > 0 ? (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                    lead.open_ticket_count >= 5
                      ? 'bg-red-500/20 text-red-400 ring-red-500/40'
                      : 'bg-blue-500/10 text-blue-400 ring-blue-500/20'
                  }`}>
                    <Ticket size={9}/> {lead.open_ticket_count}
                  </span>
                ) : (
                  <span className="text-soft/30">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, total, pageSize, onPage }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = page * pageSize + 1;
  const end   = Math.min((page + 1) * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-4 text-xs text-soft">
      <span>{total > 0 ? `${start}–${end} of ${total}` : 'No results'}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(0)} disabled={page === 0}
          className="rounded-md border border-darkbg-border bg-darkbg-800/60 px-2 py-1.5 disabled:opacity-40 hover:text-white">
          «
        </button>
        <button onClick={() => onPage(page - 1)} disabled={page === 0}
          className="rounded-md border border-darkbg-border bg-darkbg-800/60 px-2 py-1.5 disabled:opacity-40 hover:text-white">
          <ChevronLeft size={12}/>
        </button>
        <span className="px-3 py-1.5 font-semibold text-white">
          {page + 1} / {totalPages}
        </span>
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages - 1}
          className="rounded-md border border-darkbg-border bg-darkbg-800/60 px-2 py-1.5 disabled:opacity-40 hover:text-white">
          <ChevronRight size={12}/>
        </button>
        <button onClick={() => onPage(totalPages - 1)} disabled={page >= totalPages - 1}
          className="rounded-md border border-darkbg-border bg-darkbg-800/60 px-2 py-1.5 disabled:opacity-40 hover:text-white">
          »
        </button>
      </div>
    </div>
  );
}

// ─── InsightsDrawer ───────────────────────────────────────────────────────────

const INSIGHT_STORAGE_KEY = 'al_insights_open';

const FUNNEL_COLORS = {
  pending:   '#f59e0b',
  verified:  '#10b981',
  rejected:  '#ef4444',
  converted: '#a855f7',
};
const CHART_COLORS = ['#e63946','#f59e0b','#10b981','#3b82f6','#a855f7','#ec4899','#06b6d4','#84cc16'];

function InsightCard({ title, icon: Icon, children }) {
  return (
    <div className="rounded-xl border border-darkbg-border bg-darkbg-800/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={13} className="text-brandred" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-soft/60">{title}</p>
      </div>
      {children}
    </div>
  );
}

function InsightsDrawer({ open, onClose, userId }) {
  const { data: insights, isLoading } = useQuery({
    queryKey: ['lead-insights'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_lead_insights');
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });

  if (!open) return null;

  const funnel = insights?.funnel
    ? Object.entries(insights.funnel).map(([name, value]) => ({ name, value }))
    : [];
  const topSources = insights?.top_sources ?? [];
  const performers = insights?.top_performers ?? [];
  const ageDist    = insights?.age_distribution
    ? Object.entries(insights.age_distribution).map(([name, value]) => ({ name, value }))
    : [];
  const areas      = insights?.area_heatmap ?? [];
  const velocity   = insights?.ticket_velocity ?? {};

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-80 flex-col border-l border-darkbg-border bg-darkbg-900 shadow-2xl">
      <div className="flex items-center justify-between border-b border-darkbg-border px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart2 size={14} className="text-brandred" />
          <p className="font-display text-sm font-semibold text-white">Lead Insights</p>
        </div>
        <button onClick={onClose} className="rounded p-1 text-soft hover:text-white"><X size={14}/></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-darkbg-700/40" />)}
          </div>
        )}

        {!isLoading && (
          <>
            {/* Lead Funnel */}
            <InsightCard title="Lead Funnel" icon={TrendingUp}>
              {funnel.length === 0
                ? <p className="text-xs text-soft/40">No data</p>
                : (
                  <div className="space-y-2">
                    {funnel.map(({ name, value }) => (
                      <div key={name} className="flex items-center gap-2">
                        <span className="w-16 text-[10px] capitalize text-soft">{name}</span>
                        <div className="relative flex-1 h-2 rounded-full bg-darkbg-700">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{
                              width: `${Math.min(100, (value / Math.max(...funnel.map(f => f.value))) * 100)}%`,
                              backgroundColor: FUNNEL_COLORS[name] ?? '#6366f1',
                            }}
                          />
                        </div>
                        <span className="w-6 text-right text-[10px] font-bold text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                )
              }
            </InsightCard>

            {/* Top Sources */}
            <InsightCard title="Top Sources" icon={Activity}>
              {topSources.length === 0
                ? <p className="text-xs text-soft/40">No data</p>
                : (
                  <ResponsiveContainer width="100%" height={130}>
                    <BarChart data={topSources.map(s => ({ name: s.source.replace(/_/g,' '), value: s.count }))} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 9, fill: '#A9B6D6' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#A9B6D6' }} width={70} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: '#0B1C3F', border: '1px solid #22356B', borderRadius: 8, fontSize: 11 }} />
                      <Bar dataKey="value" radius={[0,4,4,0]}>
                        {topSources.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )
              }
            </InsightCard>

            {/* Top Performers */}
            <InsightCard title="Top Performers" icon={Users}>
              {performers.length === 0
                ? <p className="text-xs text-soft/40">No assignments yet</p>
                : (
                  <div className="space-y-2">
                    {performers.map(({ name, count }, i) => (
                      <div key={name} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-brandred/70">#{i + 1}</span>
                        <span className="flex-1 truncate text-[10px] text-white">{name}</span>
                        <span className="text-[10px] font-bold text-soft">{count}</span>
                      </div>
                    ))}
                  </div>
                )
              }
            </InsightCard>

            {/* Age Distribution */}
            <InsightCard title="Age Distribution" icon={Clock}>
              {ageDist.length === 0
                ? <p className="text-xs text-soft/40">No data</p>
                : (
                  <div className="space-y-2">
                    {['today','1-3d','3-7d','7-14d','14d+'].map(bucket => {
                      const entry = ageDist.find(a => a.name === bucket);
                      const val   = entry?.value ?? 0;
                      const max   = Math.max(...ageDist.map(a => a.value), 1);
                      return (
                        <div key={bucket} className="flex items-center gap-2">
                          <span className="w-10 text-[10px] text-soft">{bucket}</span>
                          <div className="relative flex-1 h-2 rounded-full bg-darkbg-700">
                            <div className="absolute inset-y-0 left-0 rounded-full bg-brandred/60" style={{ width: `${(val / max) * 100}%` }} />
                          </div>
                          <span className="w-5 text-right text-[10px] font-bold text-white">{val}</span>
                        </div>
                      );
                    })}
                  </div>
                )
              }
            </InsightCard>

            {/* Area Heatmap */}
            <InsightCard title="Area Heatmap (top 10)" icon={MapPin}>
              {areas.length === 0
                ? <p className="text-xs text-soft/40">No area data</p>
                : (
                  <div className="flex flex-wrap gap-1.5">
                    {areas.map(({ area, count }) => (
                      <span key={area} className="rounded-full border border-darkbg-border bg-darkbg-700/60 px-2.5 py-1 text-[10px] text-soft">
                        {area} <span className="font-bold text-white">{count}</span>
                      </span>
                    ))}
                  </div>
                )
              }
            </InsightCard>

            {/* Ticket Velocity */}
            <InsightCard title="Ticket Velocity" icon={Ticket}>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{velocity.avg_tickets_per_lead ?? '—'}</p>
                  <p className="text-[9px] uppercase tracking-widest text-soft">Avg / lead</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{velocity.total_open_tickets ?? '—'}</p>
                  <p className="text-[9px] uppercase tracking-widest text-soft">Total open</p>
                </div>
              </div>
            </InsightCard>
          </>
        )}
      </div>
    </div>
  );
}

// ─── RejectModal ──────────────────────────────────────────────────────────────

function RejectModal({ count, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-darkbg-border bg-darkbg-800 p-6 shadow-2xl">
        <h2 className="font-display mb-1 text-lg text-gradient">Reject {count} Lead{count !== 1 ? 's' : ''}</h2>
        <p className="mb-4 text-sm text-soft">A reason is required for bulk rejection.</p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder="e.g. Duplicate, outside service area, no contact info…"
          className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-sm text-white placeholder:text-soft/40 focus:border-brandred focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={!reason.trim()}
            className="rounded-lg bg-brandred px-4 py-2 text-xs font-semibold text-white hover:bg-brandred/80 disabled:opacity-40">
            Confirm Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SaveViewModal ────────────────────────────────────────────────────────────

function SaveViewModal({ onConfirm, onClose }) {
  const [name,     setName]     = useState('');
  const [isShared, setIsShared] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-darkbg-border bg-darkbg-800 p-6 shadow-2xl">
        <h2 className="font-display mb-4 text-lg text-gradient">Save Current View</h2>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-soft/60">View name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          placeholder="e.g. Hot Leads This Week"
          className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-sm text-white placeholder:text-soft/40 focus:border-brandred focus:outline-none"
        />
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-soft">
          <input type="checkbox" checked={isShared} onChange={e => setIsShared(e.target.checked)}
            className="accent-brandred h-4 w-4 rounded" />
          Share with all managers
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
          <button
            onClick={() => name.trim() && onConfirm(name.trim(), isShared)}
            disabled={!name.trim()}
            className="rounded-lg bg-brandred px-4 py-2 text-xs font-semibold text-white hover:bg-brandred/80 disabled:opacity-40">
            Save View
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AllLeads (main) ──────────────────────────────────────────────────────────

export default function AllLeads() {
  const { user, role, loading, roleLoaded } = useAuth();
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const isManager = MANAGER_ROLES.includes(role);

  // Redirect non-managers
  useEffect(() => {
    if (!loading && roleLoaded && user && !isManager) {
      toast('All Leads is for managers. Redirecting to My Leads.');
      navigate('/owner/leads/my', { replace: true });
    }
  }, [loading, roleLoaded, user, isManager, navigate]);

  // ── Insights open state persisted in localStorage ─────────────────────────
  const [showInsights, setShowInsights] = useState(() => {
    try { return JSON.parse(localStorage.getItem(INSIGHT_STORAGE_KEY) ?? 'false'); } catch { return false; }
  });
  function toggleInsights() {
    setShowInsights(v => {
      const next = !v;
      localStorage.setItem(INSIGHT_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  // ── Core state ────────────────────────────────────────────────────────────
  const [filters,      setFilters]      = useState(EMPTY_FILTERS);
  const [search,       setSearch]       = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort,         setSort]         = useState({ col: 'created_at', dir: 'desc' });
  const [page,         setPage]         = useState(0);
  const [selectedIds,  setSelectedIds]  = useState(new Set());
  const [showFilters,  setShowFilters]  = useState(true);
  const [activeViewId, setActiveViewId] = useState(null);

  // ── Modals ────────────────────────────────────────────────────────────────
  const [rejectModal,    setRejectModal]    = useState(false);
  const [saveViewModal,  setSaveViewModal]  = useState(false);

  // ── Debounce search ───────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // ── Staff query ───────────────────────────────────────────────────────────
  const { data: staff = [] } = useQuery({
    queryKey: ['al-staff'],
    enabled: !!user && isManager,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id,full_name')
        .order('full_name');
      return data ?? [];
    },
    staleTime: 300_000,
  });

  // ── Saved views query ─────────────────────────────────────────────────────
  const { data: savedViews = [], refetch: refetchViews } = useQuery({
    queryKey: ['al-saved-views'],
    enabled: !!user && isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_lead_views')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // ── Main leads query ──────────────────────────────────────────────────────
  const rpcArgs = useMemo(() => filtersToRpcArgs(filters, debouncedSearch, sort, page, user?.id), [filters, debouncedSearch, sort, page, user?.id]);

  const {
    data: leadsData,
    isLoading: leadsLoading,
    isFetching,
    refetch: refetchLeads,
  } = useQuery({
    queryKey: ['al-leads', rpcArgs],
    enabled: !!user && isManager,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_filtered_leads', rpcArgs);
      if (error) throw error;
      return data ?? [];
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const leads      = leadsData ?? [];
  const totalCount = leads[0]?.total_count ?? 0;

  // ── Sort handler ──────────────────────────────────────────────────────────
  function handleSort(col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
    setPage(0);
  }

  // ── Selection helpers ─────────────────────────────────────────────────────
  function toggleRow(id) {
    setSelectedIds(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleAll(rows) {
    const allSel = rows.every(r => selectedIds.has(r.id));
    setSelectedIds(s => {
      const n = new Set(s);
      rows.forEach(r => allSel ? n.delete(r.id) : n.add(r.id));
      return n;
    });
  }

  // ── Saved view apply ──────────────────────────────────────────────────────
  function applyView(view, userId) {
    const fs = view.filter_state ?? {};
    setFilters({
      status:         fs.status        ?? [],
      temperature:    fs.temperature   ?? [],
      source:         fs.source        ?? '',
      assignedTo:     fs.assigned_to === '__CURRENT_USER__' ? userId : (fs.assigned_to ?? ''),
      submittedBy:    fs.submitted_by  ?? '',
      dateFrom:       fs.date_from     ?? '',
      dateTo:         fs.date_to       ?? '',
      tags:           fs.tags          ?? '',
      area:           fs.area          ?? '',
      hasOpenTickets: fs.has_open_tickets ?? false,
      unverifiedOnly: fs.unverified_only  ?? false,
    });
    setSearch('');
    setPage(0);
    setActiveViewId(view.id);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  const selectedArr = useMemo(() => [...selectedIds], [selectedIds]);

  const verifyMutation = useMutation({
    mutationFn: () => supabase.rpc('batch_verify_leads', { p_lead_ids: selectedArr }),
    onSuccess: ({ error }) => {
      if (error) { toast.error(`Verify failed: ${error.message}`); return; }
      toast.success(`${selectedArr.length} lead(s) verified`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ['al-leads'] });
    },
    onError: e => toast.error(`Verify failed: ${e.message}`),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason) => supabase.rpc('batch_reject_leads', { p_lead_ids: selectedArr, p_reason: reason }),
    onSuccess: ({ error }) => {
      if (error) { toast.error(`Reject failed: ${error.message}`); return; }
      toast.success(`${selectedArr.length} lead(s) rejected`);
      setSelectedIds(new Set());
      setRejectModal(false);
      qc.invalidateQueries({ queryKey: ['al-leads'] });
    },
    onError: e => toast.error(`Reject failed: ${e.message}`),
  });

  const assignMutation = useMutation({
    mutationFn: (assigneeId) => supabase.rpc('batch_assign_leads', { p_lead_ids: selectedArr, p_assignee_id: assigneeId }),
    onSuccess: ({ error }, assigneeId) => {
      if (error) { toast.error(`Assign failed: ${error.message}`); return; }
      const name = staff.find(s => s.id === assigneeId)?.full_name ?? assigneeId;
      toast.success(`${selectedArr.length} lead(s) assigned to ${name}`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ['al-leads'] });
    },
    onError: e => toast.error(`Assign failed: ${e.message}`),
  });

  const tempMutation = useMutation({
    mutationFn: (temp) => supabase.rpc('batch_set_temperature', { p_lead_ids: selectedArr, p_temperature: temp }),
    onSuccess: ({ error }, temp) => {
      if (error) { toast.error(`Temperature update failed: ${error.message}`); return; }
      toast.success(`${selectedArr.length} lead(s) set to ${temp}`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ['al-leads'] });
    },
    onError: e => toast.error(`Temperature update failed: ${e.message}`),
  });

  const tagMutation = useMutation({
    mutationFn: (tag) => supabase.rpc('batch_add_tag', { p_lead_ids: selectedArr, p_tag: tag }),
    onSuccess: ({ error }, tag) => {
      if (error) { toast.error(`Tag failed: ${error.message}`); return; }
      toast.success(`Tag "${tag}" added to ${selectedArr.length} lead(s)`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ['al-leads'] });
    },
    onError: e => toast.error(`Tag failed: ${e.message}`),
  });

  // ── Export (full filtered set) ────────────────────────────────────────────
  async function handleExportAll() {
    toast('Preparing export…');
    const { data, error } = await supabase.rpc('export_leads_csv', {
      p_lead_ids:  null,
      p_search:    debouncedSearch || null,
      p_status:    filters.status.length ? filters.status : null,
      p_temperature: filters.temperature.length ? filters.temperature : null,
    });
    if (error) { toast.error(`Export failed: ${error.message}`); return; }
    downloadCsv(data, `leads-export-${new Date().toISOString().slice(0,10)}.csv`);
    toast.success('Export downloaded');
  }

  // ── Export selected ───────────────────────────────────────────────────────
  async function handleExportSelected() {
    if (selectedArr.length === 0) return;
    toast('Preparing export…');
    const { data, error } = await supabase.rpc('export_leads_csv', {
      p_lead_ids:    selectedArr,
      p_search:      null,
      p_status:      null,
      p_temperature: null,
    });
    if (error) { toast.error(`Export failed: ${error.message}`); return; }
    downloadCsv(data, `leads-selected-${new Date().toISOString().slice(0,10)}.csv`);
    toast.success('Export downloaded');
  }

  // ── Save view ─────────────────────────────────────────────────────────────
  async function handleSaveView(name, isShared) {
    if (!user) return;
    const filterState = {
      status:           filters.status.length     ? filters.status     : undefined,
      temperature:      filters.temperature.length ? filters.temperature : undefined,
      source:           filters.source             || undefined,
      assigned_to:      filters.assignedTo         || undefined,
      submitted_by:     filters.submittedBy        || undefined,
      date_from:        filters.dateFrom           || undefined,
      date_to:          filters.dateTo             || undefined,
      tags:             filters.tags               || undefined,
      area:             filters.area               || undefined,
      has_open_tickets: filters.hasOpenTickets     || undefined,
      unverified_only:  filters.unverifiedOnly     || undefined,
    };
    // Remove undefined keys
    Object.keys(filterState).forEach(k => filterState[k] === undefined && delete filterState[k]);

    const { error } = await supabase.from('saved_lead_views').insert({
      user_id: user.id,
      name,
      is_shared: isShared,
      filter_state: filterState,
    });
    if (error) { toast.error(`Save failed: ${error.message}`); return; }
    toast.success(`View "${name}" saved`);
    setSaveViewModal(false);
    refetchViews();
  }

  // ── Loading / access guards ───────────────────────────────────────────────
  if (loading || (user && !roleLoaded)) {
    return <div className="grid min-h-[50vh] place-items-center text-soft">Loading…</div>;
  }
  if (!isManager) return null; // redirect in progress

  const hasActiveFilters = !filtersAreEmpty(filters) || !!debouncedSearch;

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-soft">Leads</p>
          <h1 className="font-display text-3xl text-gradient">All Leads</h1>
          <p className="mt-1 text-sm text-soft">Manager view — full pipeline visibility.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { refetchLeads(); qc.invalidateQueries({ queryKey: ['lead-insights'] }); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-xs text-soft transition hover:text-white">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''}/> Refresh
          </button>
          <button onClick={handleExportAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-xs text-soft transition hover:text-white">
            <Download size={12}/> Export CSV
          </button>
          <button onClick={toggleInsights}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
              showInsights
                ? 'border-brandred/40 bg-brandred/10 text-white'
                : 'border-darkbg-border bg-darkbg-800/60 text-soft hover:text-white'
            }`}>
            {showInsights ? <PanelRightClose size={12}/> : <PanelRightOpen size={12}/>}
            Insights
          </button>
        </div>
      </header>

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      <StatsBar leads={leads} total={totalCount} isLoading={leadsLoading} />

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <div className="flex gap-5">
        {/* Saved views sidebar */}
        <SavedViewsSidebar
          views={savedViews}
          activeViewId={activeViewId}
          onApply={applyView}
          onSaveNew={() => setSaveViewModal(true)}
          userId={user?.id}
        />

        {/* Table area */}
        <div className="min-w-0 flex-1 space-y-3">
          {/* Search + filter toggle */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-soft/50" />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search business, contact, phone, email…"
                className="w-full rounded-lg border border-darkbg-border bg-darkbg-800/60 py-2 pl-9 pr-3 text-sm text-white placeholder:text-soft/40 focus:border-brandred focus:outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-soft hover:text-white">
                  <X size={13}/>
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                showFilters || hasActiveFilters
                  ? 'border-brandred/40 bg-brandred/10 text-white'
                  : 'border-darkbg-border bg-darkbg-800/60 text-soft hover:text-white'
              }`}
            >
              <SlidersHorizontal size={13}/>
              Filters
              {hasActiveFilters && (
                <span className="ml-0.5 rounded-full bg-brandred/80 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {[
                    filters.status.length, filters.temperature.length,
                    filters.source ? 1 : 0, filters.assignedTo ? 1 : 0,
                    filters.submittedBy ? 1 : 0,
                    filters.dateFrom || filters.dateTo ? 1 : 0,
                    filters.tags ? 1 : 0, filters.area ? 1 : 0,
                    filters.hasOpenTickets ? 1 : 0, filters.unverifiedOnly ? 1 : 0,
                    debouncedSearch ? 1 : 0,
                  ].reduce((a, b) => a + b, 0)}
                </span>
              )}
            </button>
            {hasActiveFilters && (
              <button
                onClick={() => { setFilters(EMPTY_FILTERS); setSearch(''); setActiveViewId(null); setPage(0); }}
                className="inline-flex items-center gap-1 rounded-lg border border-darkbg-border bg-darkbg-800/60 px-2.5 py-2 text-xs text-soft transition hover:text-white"
              >
                <X size={12}/> Clear
              </button>
            )}
          </div>

          {/* Filter panel */}
          <FilterPanel
            filters={filters}
            setFilters={(updater) => { setFilters(updater); setPage(0); setActiveViewId(null); }}
            staff={staff}
            open={showFilters}
          />

          {/* Bulk toolbar */}
          <BulkToolbar
            selectedIds={selectedIds}
            onClear={() => setSelectedIds(new Set())}
            onVerify={() => verifyMutation.mutate()}
            onReject={() => setRejectModal(true)}
            onAssign={(id) => assignMutation.mutate(id)}
            onSetTemp={(t) => tempMutation.mutate(t)}
            onAddTag={(tag) => tagMutation.mutate(tag)}
            onExport={handleExportSelected}
            staff={staff}
          />

          {/* Table */}
          <LeadsTable
            leads={leads}
            sort={sort}
            onSort={handleSort}
            selectedIds={selectedIds}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
            onRowClick={(id) => navigate(`/owner/leads/${id}/inbox`)}
            isLoading={leadsLoading}
          />

          {/* Pagination */}
          {totalCount > 0 && (
            <Pagination
              page={page}
              total={totalCount}
              pageSize={PAGE_SIZE}
              onPage={(p) => { setPage(p); setSelectedIds(new Set()); }}
            />
          )}
        </div>
      </div>

      {/* ── Insights drawer ───────────────────────────────────────────────── */}
      <InsightsDrawer open={showInsights} onClose={toggleInsights} userId={user?.id} />
      {showInsights && <div className="fixed inset-0 z-30" onClick={toggleInsights} />}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {rejectModal && (
        <RejectModal
          count={selectedIds.size}
          onConfirm={(reason) => rejectMutation.mutate(reason)}
          onClose={() => setRejectModal(false)}
        />
      )}
      {saveViewModal && (
        <SaveViewModal
          onConfirm={handleSaveView}
          onClose={() => setSaveViewModal(false)}
        />
      )}
    </div>
  );
}
