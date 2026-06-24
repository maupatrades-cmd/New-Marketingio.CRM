import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Loader2, CheckCircle2, Clock, AlarmClock, CalendarCheck,
  ListTodo, Flame, ExternalLink, ChevronDown,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';

const MANAGER_ROLES = ['owner', 'admin', 'head_of_tech'];

// Priority is free text; rank it so urgent floats to the top. Postgres
// can't order these sensibly (alphabetical would put 'high' below 'medium'),
// so we group + sort client-side.
const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'];
const PRIORITY_RANK = Object.fromEntries(PRIORITY_ORDER.map((p, i) => [p, i]));
const PRIORITY_META = {
  urgent: { label: 'Urgent', emoji: '🔴', accent: 'text-brandred' },
  high:   { label: 'High',   emoji: '🟠', accent: 'text-orange-400' },
  medium: { label: 'Medium', emoji: '🟡', accent: 'text-yellow-400' },
  low:    { label: 'Low',    emoji: '🟢', accent: 'text-emerald-400' },
};

function rankOf(priority) {
  const r = PRIORITY_RANK[priority];
  return r === undefined ? PRIORITY_ORDER.length : r;
}

function isOverdue(due) {
  if (!due) return false;
  return due < new Date().toISOString().slice(0, 10);
}

function dueLabel(due) {
  if (!due) return 'No due date';
  const d = new Date(due + 'T00:00:00');
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' });
}

// Best-effort anchor for the [Open] button — route to the closest real
// surface based on what the task is tied to.
function taskHref(task) {
  if (task.deal_id) return '/owner/sales/deals';
  if (task.source_entity_type === 'lead' && task.source_entity_id) return '/owner/sales/leads';
  if (task.onboarding_id) return '/owner/onboarding-submissions';
  if (task.client_id) return '/owner/sales/leads';
  return null;
}

export default function MyDay() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isManager = MANAGER_ROLES.includes(role);

  // When a manager picks someone else, view their day instead of ours.
  const [viewUserId, setViewUserId] = useState(null);
  const targetUserId = viewUserId || user?.id;
  const viewingSelf = targetUserId === user?.id;

  // KPI strip — driven by the universal task fabric RPC.
  const { data: stats } = useQuery({
    queryKey: ['my-day-stats', targetUserId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_day_stats', {
        p_user_id: viewingSelf ? null : targetUserId,
      });
      if (error) throw error;
      return data ?? {};
    },
  });

  // The task list itself.
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['my-day-tasks', targetUserId],
    enabled: !!targetUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', targetUserId)
        .eq('status', 'open')
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Manager dropdown — list everyone so they can view a teammate's day.
  const { data: people } = useQuery({
    queryKey: ['my-day-people'],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Group by priority (urgent → low); due_date asc inside each group.
  const groups = useMemo(() => {
    const byPriority = new Map();
    for (const t of tasks ?? []) {
      const key = PRIORITY_ORDER.includes(t.priority) ? t.priority : 'low';
      if (!byPriority.has(key)) byPriority.set(key, []);
      byPriority.get(key).push(t);
    }
    return PRIORITY_ORDER
      .filter((p) => byPriority.has(p))
      .map((p) => ({
        priority: p,
        meta: PRIORITY_META[p],
        items: byPriority.get(p).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')),
      }));
  }, [tasks]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['my-day-stats', targetUserId] });
    queryClient.invalidateQueries({ queryKey: ['my-day-tasks', targetUserId] });
  }

  async function onComplete(task) {
    const { error } = await supabase.rpc('complete_task', {
      p_task_id: task.id,
      p_completion_notes: null,
    });
    if (error) toast.error(error.message);
    else { toast.success('Task completed'); refresh(); }
  }

  async function onSnooze(task) {
    const base = task.due_date ? new Date(task.due_date + 'T00:00:00') : new Date();
    base.setDate(base.getDate() + 1);
    const next = base.toISOString().slice(0, 10);
    const { error } = await supabase.from('tasks').update({ due_date: next }).eq('id', task.id);
    if (error) toast.error(error.message);
    else { toast.success('Snoozed to ' + dueLabel(next)); refresh(); }
  }

  function onOpen(task) {
    const href = taskHref(task);
    if (href) navigate(href);
    else toast.message('No linked record for this task');
  }

  const viewedPerson = !viewingSelf
    ? (people ?? []).find((p) => p.id === targetUserId)
    : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-soft">Overview</p>
          <h1 className="font-display text-3xl text-gradient">My Day</h1>
          <p className="mt-1 text-sm text-soft">
            {viewingSelf
              ? 'Everything assigned to you today — verified leads, advancing deals, chases and more.'
              : `Viewing ${viewedPerson?.full_name || viewedPerson?.email || 'teammate'}'s day.`}
          </p>
        </div>

        {isManager && (
          <label className="relative inline-flex items-center">
            <span className="mr-2 text-xs uppercase tracking-widest text-soft">View as</span>
            <span className="relative inline-flex items-center">
              <select
                value={targetUserId || ''}
                onChange={(e) => setViewUserId(e.target.value === user.id ? null : e.target.value)}
                className="appearance-none rounded-full border border-darkbg-border bg-darkbg-800/60 py-2 pl-4 pr-9 text-sm text-white outline-none transition hover:bg-darkbg-800"
              >
                <option value={user.id}>Me</option>
                {(people ?? [])
                  .filter((p) => p.id !== user.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                  ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 text-soft" />
            </span>
          </label>
        )}
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi icon={ListTodo}      label="Open"        value={stats?.open_total} />
        <Kpi icon={Flame}         label="Urgent"      value={stats?.urgent} accent={stats?.urgent ? 'text-brandred' : undefined} />
        <Kpi icon={AlarmClock}    label="Overdue"     value={stats?.overdue} accent={stats?.overdue ? 'text-brandred' : undefined} />
        <Kpi icon={Clock}         label="Due today"   value={stats?.due_today} />
        <Kpi icon={CalendarCheck} label="Done today"  value={stats?.completed_today} accent="text-emerald-400" />
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="grid place-items-center py-20">
          <Loader2 size={28} className="animate-spin text-soft" />
        </div>
      ) : (tasks ?? []).length === 0 ? (
        <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-12 text-center">
          <CheckCircle2 size={28} className="mx-auto text-emerald-400" />
          <p className="mt-3 font-display text-lg text-white">Inbox zero</p>
          <p className="mt-1 text-sm text-soft">No open tasks. Enjoy the calm.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.priority}>
              <h2 className={`mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest ${g.meta.accent}`}>
                <span>{g.meta.emoji}</span> {g.meta.label}
                <span className="text-soft">({g.items.length})</span>
              </h2>
              <ul className="space-y-2">
                {g.items.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    readOnly={!viewingSelf}
                    onComplete={() => onComplete(t)}
                    onSnooze={() => onSnooze(t)}
                    onOpen={() => onOpen(t)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-soft">{label}</p>
        <Icon size={15} className="text-soft" />
      </div>
      <p className={`mt-2 font-display text-3xl ${accent || 'text-white'}`}>{value ?? 0}</p>
    </div>
  );
}

function TaskCard({ task, readOnly, onComplete, onSnooze, onOpen }) {
  const overdue = isOverdue(task.due_date);
  const meta = PRIORITY_META[task.priority] || PRIORITY_META.low;
  const href = taskHref(task);

  return (
    <li className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold text-white">
            <span>{meta.emoji}</span>
            <span className="truncate">{task.title}</span>
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
            {task.source_action && (
              <span className="rounded-full border border-darkbg-border bg-darkbg-900/60 px-2 py-0.5 uppercase tracking-wide text-soft">
                from: {task.source_action}
              </span>
            )}
            {task.client_name && <span className="text-soft">{task.client_name}</span>}
            <span className={overdue ? 'font-semibold text-brandred' : 'text-soft'}>
              {overdue ? 'Overdue · ' : ''}{dueLabel(task.due_date)}
            </span>
          </div>
        </div>

        <div className="flex flex-none items-center gap-2">
          {!readOnly && (
            <>
              <button
                onClick={onComplete}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
              >
                <CheckCircle2 size={14} /> Complete
              </button>
              <button
                onClick={onSnooze}
                className="inline-flex items-center gap-1.5 rounded-full border border-darkbg-border bg-darkbg-900/60 px-3 py-1.5 text-xs text-soft transition hover:text-white"
              >
                <AlarmClock size={14} /> Snooze 1 day
              </button>
            </>
          )}
          <button
            onClick={onOpen}
            disabled={!href}
            className="inline-flex items-center gap-1.5 rounded-full border border-darkbg-border bg-darkbg-900/60 px-3 py-1.5 text-xs text-soft transition hover:text-white disabled:opacity-40"
          >
            <ExternalLink size={14} /> Open
          </button>
        </div>
      </div>
    </li>
  );
}
