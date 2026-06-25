import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckSquare, ListTodo, AlertTriangle, TrendingUp, DollarSign,
  Calendar, Activity, ChevronRight, CheckCircle2, Clock,
  Briefcase, Sun, MessageSquare, ClipboardList, UserMinus, Plus,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';

const MANAGER_ROLES = ['owner', 'admin', 'head_of_tech'];
const ZAR = (v) => v == null ? '—' : `R ${Number(v).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
const friendlyDate = () => new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const STAGE_LABEL = {
  new_lead: 'New lead', contacted: 'Contacted',
  qualified: 'Qualified', proposal: 'Proposal', negotiation: 'Negotiation',
  closed_won: 'Won', closed_lost: 'Lost',
};
const ROLE_FLAVOUR = {
  cpc:         { label: 'CPC',         emphasis: 'leads captured + R87/R250 bonuses' },
  field_agent: { label: 'Field agent', emphasis: 'pulse walks + leads captured' },
  admin:       { label: 'Admin',       emphasis: 'contracts to load + setup fees to chase' },
  owner:       { label: 'Owner',       emphasis: 'pipeline + team forecast' },
  head_of_tech:{ label: 'Head of Tech',emphasis: 'team + delivery' },
};
const TABS = [
  { id: 'today',    label: 'Today',    icon: Sun },
  { id: 'tasks',    label: 'Tasks',    icon: ListTodo },
  { id: 'sales',    label: 'Sales',    icon: TrendingUp },
  { id: 'activity', label: 'Activity', icon: Activity },
];

export default function MyWorkspace() {
  const { user, profile, role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'today';
  const setTab = (t) => setSearchParams(p => { p.set('tab', t); return p; }, { replace: true });

  const isManager = MANAGER_ROLES.includes(role);
  const [viewAs, setViewAs] = useState(null);
  const targetUserId = isManager && viewAs ? viewAs : user?.id;

  // Manager "View as" — list of staff
  const staffQ = useQuery({
    queryKey: ['workspace_staff_list'],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name', { ascending: true })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Stats RPCs
  const dayStatsQ = useQuery({
    queryKey: ['my_day_stats', targetUserId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_day_stats',
        isManager && viewAs ? { p_user_id: viewAs } : {});
      if (error) throw error;
      return data;
    },
  });
  const salesSummaryQ = useQuery({
    queryKey: ['my_sales_summary', targetUserId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_sales_summary',
        isManager && viewAs ? { p_user_id: viewAs } : {});
      if (error) throw error;
      return data;
    },
  });

  // Tasks for this user
  const tasksQ = useQuery({
    queryKey: ['my_tasks', targetUserId],
    enabled: !!targetUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, description, due_date, status, priority, source_action, client_name, deal_id, created_at, completed_at')
        .eq('assigned_to', targetUserId)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Deals for this user (closer or cpc)
  const dealsQ = useQuery({
    queryKey: ['my_deals', targetUserId],
    enabled: !!targetUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, client_name, stage, package, setup_fee, monthly_retainer, probability, updated_at, created_at, closed_at, closer_id, cpc_id')
        .or(`closer_id.eq.${targetUserId},cpc_id.eq.${targetUserId}`)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Activity (audit log) — last 30 days
  const activityQ = useQuery({
    queryKey: ['my_activity', targetUserId],
    enabled: !!targetUserId && tab === 'activity',
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('audit_log')
        .select('id, action, table_name, row_id, created_at, after_data')
        .eq('actor_id', targetUserId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Complete-task mutation
  const completeTask = useMutation({
    mutationFn: async (taskId) => {
      const { error } = await supabase.rpc('complete_task',
        { p_task_id: taskId, p_completion_notes: null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Task completed');
      qc.invalidateQueries({ queryKey: ['my_tasks', targetUserId] });
      qc.invalidateQueries({ queryKey: ['my_day_stats', targetUserId] });
    },
    onError: (e) => toast.error(e.message || 'Could not complete task'),
  });

  // Snooze = push due_date by 1 day (direct UPDATE — RLS already restricts to assignee)
  const snoozeTask = useMutation({
    mutationFn: async (task) => {
      const next = new Date((task.due_date ? new Date(task.due_date) : new Date()).getTime() + 86_400_000)
        .toISOString().slice(0, 10);
      const { error } = await supabase
        .from('tasks').update({ due_date: next }).eq('id', task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Snoozed 1 day');
      qc.invalidateQueries({ queryKey: ['my_tasks', targetUserId] });
    },
    onError: (e) => toast.error(e.message || 'Could not snooze'),
  });

  const [taskModal, setTaskModal] = useState(null);
  // taskModal = null | { type: 'comment'|'instruction'|'reassign'|'create', task? }

  const isViewingAs = isManager && !!viewAs;
  const viewAsName = staffQ.data?.find(s => s.id === viewAs)?.full_name || 'staff member';

  async function handleCommentTask(taskId, body, commentType) {
    const { error } = await supabase.rpc('comment_on_task', {
      p_task_id: taskId, p_body: body, p_comment_type: commentType,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(commentType === 'instruction' ? 'Instruction added' : 'Comment added');
    setTaskModal(null);
  }

  async function handleReassignTask(taskId, newUserId, reason) {
    const { error } = await supabase.rpc('reassign_task_to_user', {
      p_task_id: taskId, p_new_user_id: newUserId, p_reason: reason || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Task reassigned');
    setTaskModal(null);
    qc.invalidateQueries({ queryKey: ['my_tasks', targetUserId] });
  }

  async function handleCreateTask(title, dueDate, description) {
    const { error } = await supabase.rpc('add_task_for_user', {
      p_assigned_to: viewAs, p_title: title,
      p_due_date: dueDate || null, p_description: description || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Task created');
    setTaskModal(null);
    qc.invalidateQueries({ queryKey: ['my_tasks', targetUserId] });
  }

  const firstName = (profile?.full_name || user?.email || 'there').split(' ')[0];
  const flavour = ROLE_FLAVOUR[role];

  const stats = dayStatsQ.data || {};
  const sales = salesSummaryQ.data || {};

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">
            {greet()}, <span className="text-gradient">{firstName}</span> 👋
          </h1>
          <p className="mt-1 text-sm text-soft">
            {friendlyDate()}
            {flavour && <span className="ml-2 text-soft/70">· {flavour.label} focus: {flavour.emphasis}</span>}
          </p>
        </div>
        {isManager && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-soft uppercase tracking-widest">Viewing as</label>
            <select
              value={viewAs ?? ''}
              onChange={(e) => setViewAs(e.target.value || null)}
              className="rounded-lg border border-darkbg-border bg-darkbg-800/60 px-2 py-1.5 text-sm text-white"
            >
              <option value="">Self ({firstName})</option>
              {(staffQ.data ?? []).filter(s => s.id !== user?.id).map(s => (
                <option key={s.id} value={s.id}>{s.full_name || s.email}</option>
              ))}
            </select>
            {isViewingAs && (
              <button
                onClick={() => setTaskModal({ type: 'create' })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brandred px-3 py-1.5 text-xs text-white hover:brightness-110"
              >
                <Plus size={13}/> Create Task
              </button>
            )}
          </div>
        )}
      </header>

      {/* KPI Strip */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          icon={ListTodo} label="Open Tasks" value={stats.open_total ?? '—'}
          sub={stats.overdue ? `${stats.overdue} overdue` : 'Due dates clear'}
          onClick={() => setTab('tasks')}
        />
        <Kpi
          icon={AlertTriangle} label="Urgent" value={stats.urgent ?? '—'}
          sub={stats.due_today ? `${stats.due_today} due today` : 'Nothing on fire'}
          tone={(stats.urgent ?? 0) > 0 ? 'danger' : 'normal'}
          onClick={() => setTab('tasks')}
        />
        <Kpi
          icon={TrendingUp} label="Open Deals" value={sales.open_deals_total ?? '—'}
          sub={ZAR(sales.open_deals_value)}
          onClick={() => setTab('sales')}
        />
        <Kpi
          icon={DollarSign} label="Forecast" value={ZAR(sales.weighted_forecast)}
          sub={`${sales.won_this_month ?? 0} won this month`}
        />
      </section>

      {/* Tabs */}
      <nav className="flex items-center gap-1 border-b border-darkbg-border">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
              tab === t.id
                ? 'border-brandred text-white'
                : 'border-transparent text-soft hover:text-white'
            }`}
          >
            <t.icon size={14}/> {t.label}
          </button>
        ))}
      </nav>

      {tab === 'today'    && <TodayTab tasks={tasksQ.data ?? []} deals={dealsQ.data ?? []}
                                       onComplete={completeTask.mutate} busyId={completeTask.variables}
                                       isViewingAs={isViewingAs}
                                       onTaskAction={(type, task) => setTaskModal({ type, task })}/>}
      {tab === 'tasks'    && <TasksTab tasks={tasksQ.data ?? []} loading={tasksQ.isLoading}
                                       onComplete={completeTask.mutate} onSnooze={snoozeTask.mutate}
                                       isViewingAs={isViewingAs}
                                       onTaskAction={(type, task) => setTaskModal({ type, task })}/>}
      {tab === 'sales'    && <SalesTab deals={dealsQ.data ?? []} loading={dealsQ.isLoading} navigate={navigate}/>}
      {tab === 'activity' && <ActivityTab rows={activityQ.data ?? []} loading={activityQ.isLoading}/>}

      {taskModal && taskModal.type !== 'create' && (
        <TaskActionModal
          type={taskModal.type}
          task={taskModal.task}
          staff={staffQ.data ?? []}
          onClose={() => setTaskModal(null)}
          onComment={(id, body) => handleCommentTask(id, body, 'comment')}
          onInstruct={(id, body) => handleCommentTask(id, body, 'instruction')}
          onReassign={handleReassignTask}
        />
      )}
      {taskModal?.type === 'create' && (
        <CreateTaskModal
          assigneeName={viewAsName}
          onClose={() => setTaskModal(null)}
          onSubmit={handleCreateTask}
        />
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone, onClick }) {
  const danger = tone === 'danger';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`card p-4 text-left ${onClick ? 'hover:bg-darkbg-800 transition' : ''} ${danger ? 'border border-brandred/40 bg-brandred/5' : ''}`}
    >
      <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-widest text-soft">
        <Icon size={13} className={danger ? 'text-brandred' : ''}/> {label}
      </div>
      <p className={`font-display text-2xl ${danger ? 'text-brandred' : 'text-white'}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-soft">{sub}</p>}
    </Tag>
  );
}

// ── TODAY ────────────────────────────────────────────────────────────
function TodayTab({ tasks, deals, onComplete, busyId, isViewingAs, onTaskAction }) {
  const today = new Date().toISOString().slice(0, 10);
  const open = tasks.filter(t => t.status === 'open');
  const urgent  = open.filter(t => t.priority === 'urgent' || (t.due_date && t.due_date < today));
  const dueToday = open.filter(t => t.due_date === today && t.priority !== 'urgent');
  const upcoming = open.filter(t => t.due_date && t.due_date > today).slice(0, 8);

  const Section = ({ title, items, tone, empty }) => (
    <div className="space-y-2">
      <h3 className="text-xs uppercase tracking-widest text-soft">{title} · {items.length}</h3>
      {items.length === 0 && <p className="card p-3 text-center text-xs text-soft">{empty}</p>}
      {items.map(t => (
        <TaskCard key={t.id} task={t} tone={tone} onComplete={() => onComplete(t.id)} busy={busyId === t.id}
          isViewingAs={isViewingAs} onTaskAction={onTaskAction}/>
      ))}
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Section title="Urgent / Overdue" items={urgent}   tone="danger"  empty="Nothing urgent."/>
      <Section title="Due Today"        items={dueToday} tone="warn"    empty="Nothing due today."/>
      <Section title="Coming Up"        items={upcoming} tone="normal"  empty="Calendar is clear."/>
    </div>
  );
}

function TaskCard({ task, tone, onComplete, busy, isViewingAs, onTaskAction }) {
  const border = tone === 'danger' ? 'border-l-4 border-brandred'
              : tone === 'warn'   ? 'border-l-4 border-orange-500'
              : 'border-l-4 border-darkbg-border';
  return (
    <div className={`card ${border} p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-white">{task.title}</p>
          <p className="mt-0.5 text-[11px] text-soft">
            {task.client_name && <>{task.client_name} · </>}
            {task.due_date ? `due ${task.due_date}` : 'no date'}
            {task.source_action && <> · {task.source_action.replace(/_/g, ' ')}</>}
          </p>
        </div>
        <button
          onClick={onComplete}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <CheckCircle2 size={12}/> Complete
        </button>
      </div>
      {isViewingAs && (
        <div className="mt-2 flex flex-wrap gap-1">
          <button onClick={() => onTaskAction('comment', task)}
            className="inline-flex items-center gap-1 rounded border border-darkbg-border px-2 py-1 text-[11px] text-soft hover:text-white">
            <MessageSquare size={10}/> Comment
          </button>
          <button onClick={() => onTaskAction('instruction', task)}
            className="inline-flex items-center gap-1 rounded border border-blue-500/30 px-2 py-1 text-[11px] text-blue-400 hover:text-blue-300">
            <ClipboardList size={10}/> Instruct
          </button>
          <button onClick={() => onTaskAction('reassign', task)}
            className="inline-flex items-center gap-1 rounded border border-orange-500/30 px-2 py-1 text-[11px] text-orange-400 hover:text-orange-300">
            <UserMinus size={10}/> Reassign
          </button>
        </div>
      )}
    </div>
  );
}

// ── TASKS ────────────────────────────────────────────────────────────
const TASK_FILTERS = ['all', 'open', 'completed', 'cancelled'];
function TasksTab({ tasks, loading, onComplete, onSnooze, isViewingAs, onTaskAction }) {
  const [filter, setFilter] = useState('open');
  const filtered = tasks.filter(t => filter === 'all' ? true : t.status === filter);
  const grouped = useMemo(() => {
    const m = new Map();
    for (const t of filtered) {
      const k = t.source_action || 'manual';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    }
    return [...m.entries()];
  }, [filtered]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TASK_FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs uppercase tracking-widest transition ${
              filter === f ? 'border-brandred bg-brandred/10 text-brandred' : 'border-darkbg-border text-soft hover:text-white'
            }`}>{f}</button>
        ))}
        <span className="ml-auto text-xs text-soft">{filtered.length} task{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      {loading && <p className="text-soft text-sm">Loading…</p>}
      {!loading && filtered.length === 0 && (
        <p className="card p-6 text-center text-sm text-soft">Nothing in "{filter}".</p>
      )}
      {grouped.map(([cat, items]) => (
        <div key={cat} className="space-y-2">
          <h3 className="text-xs uppercase tracking-widest text-soft">
            {cat.replace(/_/g, ' ')} · {items.length}
          </h3>
          {items.map(t => (
            <div key={t.id} className="card flex items-start gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{t.title}</p>
                <p className="mt-0.5 text-[11px] text-soft">
                  {t.client_name && <>{t.client_name} · </>}
                  {t.due_date ? `due ${t.due_date}` : 'no date'}
                  {t.priority && <> · {t.priority}</>}
                  {t.status !== 'open' && <> · {t.status}</>}
                </p>
              </div>
              {t.status === 'open' && (
                <div className="flex flex-none flex-wrap gap-1">
                  <button onClick={() => onComplete(t.id)}
                    className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20">
                    Complete
                  </button>
                  <button onClick={() => onSnooze(t)}
                    className="rounded border border-darkbg-border px-2 py-1 text-[11px] text-soft hover:text-white">
                    +1d
                  </button>
                  {isViewingAs && (
                    <>
                      <button onClick={() => onTaskAction('comment', t)}
                        className="rounded border border-darkbg-border px-2 py-1 text-[11px] text-soft hover:text-white">
                        <MessageSquare size={10}/>
                      </button>
                      <button onClick={() => onTaskAction('instruction', t)}
                        className="rounded border border-blue-500/30 px-2 py-1 text-[11px] text-blue-400 hover:text-blue-300">
                        <ClipboardList size={10}/>
                      </button>
                      <button onClick={() => onTaskAction('reassign', t)}
                        className="rounded border border-orange-500/30 px-2 py-1 text-[11px] text-orange-400 hover:text-orange-300">
                        <UserMinus size={10}/>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── SALES ────────────────────────────────────────────────────────────
function SalesTab({ deals, loading, navigate }) {
  const open = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage));
  const closedThisMonth = deals.filter(d => {
    if (d.stage !== 'closed_won') return false;
    const t = d.closed_at && new Date(d.closed_at);
    if (!t) return false;
    const now = new Date();
    return t.getMonth() === now.getMonth() && t.getFullYear() === now.getFullYear();
  });

  const byStage = useMemo(() => {
    const m = new Map();
    for (const d of open) {
      if (!m.has(d.stage)) m.set(d.stage, []);
      m.get(d.stage).push(d);
    }
    return [...m.entries()];
  }, [open]);

  return (
    <div className="space-y-4">
      {loading && <p className="text-sm text-soft">Loading deals…</p>}
      {!loading && open.length === 0 && (
        <p className="card p-6 text-center text-sm text-soft">No open deals.</p>
      )}
      {byStage.map(([stage, items]) => (
        <div key={stage} className="space-y-2">
          <h3 className="text-xs uppercase tracking-widest text-soft">
            {STAGE_LABEL[stage] ?? stage} · {items.length}
          </h3>
          {items.map(d => {
            const dis = Math.floor((Date.now() - new Date(d.updated_at).getTime()) / 86_400_000);
            return (
              <button key={d.id}
                onClick={() => navigate(`/owner/sales/leads?deal=${d.id}`)}
                className="card flex w-full items-center justify-between p-3 text-left transition hover:bg-darkbg-800">
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{d.client_name}</p>
                  <p className="mt-0.5 text-[11px] text-soft">
                    {d.package || '—'} · {ZAR(d.monthly_retainer)}/mo · {dis}d in stage
                  </p>
                </div>
                <ChevronRight size={16} className="text-soft"/>
              </button>
            );
          })}
        </div>
      ))}

      {closedThisMonth.length > 0 && (
        <div className="space-y-2 pt-4">
          <h3 className="text-xs uppercase tracking-widest text-soft">Closed this month · {closedThisMonth.length}</h3>
          {closedThisMonth.map(d => (
            <div key={d.id} className="card flex items-center justify-between p-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-white">{d.client_name}</p>
                <p className="mt-0.5 text-[11px] text-soft">{d.package || '—'} · {ZAR(d.monthly_retainer)}/mo</p>
              </div>
              <CheckCircle2 size={16} className="text-emerald-400"/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TASK MODALS ───────────────────────────────────────────────────────
function TaskActionModal({ type, task, staff, onClose, onComment, onInstruct, onReassign }) {
  const [body, setBody] = useState('');
  const [toUser, setToUser] = useState('');
  const [reason, setReason] = useState('');

  if (type === 'comment' || type === 'instruction') {
    const isInstruct = type === 'instruction';
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-darkbg-border bg-darkbg-800 p-6 shadow-2xl">
          <h2 className="mb-1 font-display text-lg text-white">
            {isInstruct ? '📋 Add Instruction' : '💬 Add Comment'}
          </h2>
          <p className="mb-3 text-xs text-soft truncate">{task?.title}</p>
          <textarea rows={3} value={body} onChange={e => setBody(e.target.value)}
            placeholder={isInstruct ? 'Instruction for this task…' : 'Leave a comment…'}
            className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-sm text-white placeholder:text-soft/40 focus:border-brandred focus:outline-none"/>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-darkbg-border px-4 py-2 text-xs text-soft hover:text-white">Cancel</button>
            <button onClick={() => body.trim() && (isInstruct ? onInstruct(task.id, body) : onComment(task.id, body))}
              disabled={!body.trim()}
              className="rounded-lg bg-brandred px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 hover:brightness-110">
              {isInstruct ? 'Add Instruction' : 'Post Comment'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'reassign') {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-darkbg-border bg-darkbg-800 p-6 shadow-2xl">
          <h2 className="mb-1 font-display text-lg text-white">🔄 Reassign Task</h2>
          <p className="mb-3 text-xs text-soft truncate">{task?.title}</p>
          <div className="space-y-3">
            <label className="block text-sm text-soft">Assign to
              <select value={toUser} onChange={e => setToUser(e.target.value)}
                className="mt-1 w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-white">
                <option value="">Select person…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
              </select>
            </label>
            <label className="block text-sm text-soft">Reason (optional)
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                className="mt-1 w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-white"/>
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-darkbg-border px-4 py-2 text-xs text-soft hover:text-white">Cancel</button>
            <button onClick={() => toUser && onReassign(task.id, toUser, reason)}
              disabled={!toUser}
              className="rounded-lg bg-brandred px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 hover:brightness-110">
              Reassign
            </button>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

function CreateTaskModal({ assigneeName, onClose, onSubmit }) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-darkbg-border bg-darkbg-800 p-6 shadow-2xl">
        <h2 className="mb-1 font-display text-lg text-white">➕ Create Task</h2>
        <p className="mb-3 text-xs text-soft">For: {assigneeName}</p>
        <div className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Task title *"
            className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-sm text-white placeholder:text-soft/40 focus:border-brandred focus:outline-none"/>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-sm text-white"/>
          <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-sm text-white placeholder:text-soft/40 focus:border-brandred focus:outline-none"/>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-darkbg-border px-4 py-2 text-xs text-soft hover:text-white">Cancel</button>
          <button onClick={() => title.trim() && onSubmit(title.trim(), dueDate, description.trim())}
            disabled={!title.trim()}
            className="rounded-lg bg-brandred px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 hover:brightness-110">
            Create Task
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ACTIVITY ─────────────────────────────────────────────────────────
function ActivityTab({ rows, loading }) {
  if (loading) return <p className="text-sm text-soft">Loading activity…</p>;
  if (rows.length === 0) return <p className="card p-6 text-center text-sm text-soft">No activity in the last 30 days.</p>;
  return (
    <ul className="space-y-2">
      {rows.map(r => (
        <li key={r.id} className="card flex items-start gap-3 p-3">
          <Briefcase size={14} className="mt-0.5 text-soft"/>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white">
              {r.action.replace(/_/g, ' ')} <span className="text-soft">on</span> {r.table_name}
            </p>
            <p className="mt-0.5 text-[11px] text-soft">{new Date(r.created_at).toLocaleString('en-ZA')}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
