import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, MoreVertical, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';
import Modal from '../../components/Modal.jsx';
import TaskDetailDrawer from '../../components/TaskDetailDrawer.jsx';
import NewTaskModal from '../../components/NewTaskModal.jsx';

const PRIORITY_COLOR = {
  urgent: 'text-brandred bg-brandred/10 border-brandred/40',
  high:   'text-orange-300 bg-orange-300/10 border-orange-300/40',
  medium: 'text-blue-300 bg-blue-300/10 border-blue-300/40',
  low:    'text-soft bg-darkbg-800/40 border-darkbg-border',
};
const PRIORITY_WEIGHT = { urgent: 4, high: 3, medium: 2, low: 1 };

function isOverdue(dueDate, status) {
  if (!dueDate || ['done', 'cancelled'].includes(status)) return false;
  return new Date(dueDate).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
}

function relativeDate(iso) {
  if (!iso) return '—';
  const due = new Date(iso).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  const days = Math.floor((due - today) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `Due in ${days}d`;
}

export default function Tasks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [filterMine, setFilterMine] = useState(true);
  const [filterUrgent, setFilterUrgent] = useState(false);
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterAuto, setFilterAuto] = useState(false);
  const [filterDone, setFilterDone] = useState(false);
  const [openDrawer, setOpenDrawer] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null); // task id

  const tasksQ = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          id, title, description, priority, status, due_date,
          assigned_to, assigned_to_name, created_by,
          client_id, deal_id, auto_generated, source_action,
          created_at, completed_at,
          clients:client_id (business_name),
          deals:deal_id (id, stage)
        `)
        .order('priority', { ascending: false })
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const staffQ = useQuery({
    queryKey: ['staff_for_tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role, profiles:user_id (full_name)')
        .in('role', ['owner', 'admin', 'field_agent', 'cpc', 'head_of_tech']);
      if (error) throw error;
      return (data ?? []).map(r => ({
        id: r.user_id,
        name: r.profiles?.full_name || 'Unknown',
        role: r.role,
      }));
    },
    staleTime: 300_000,
  });

  const filtered = useMemo(() => {
    let rows = tasksQ.data ?? [];

    if (filterMine) rows = rows.filter(r => r.assigned_to === user?.id);
    if (filterUrgent) rows = rows.filter(r => r.priority === 'urgent');
    if (filterOverdue) rows = rows.filter(r => isOverdue(r.due_date, r.status));
    if (filterAuto) rows = rows.filter(r => r.auto_generated);
    if (!filterDone) rows = rows.filter(r => r.status !== 'done' && r.status !== 'cancelled');

    // Sort: priority DESC, overdue first, due_date ASC, created_at DESC
    return rows.sort((a, b) => {
      const aPri = PRIORITY_WEIGHT[a.priority] ?? 0;
      const bPri = PRIORITY_WEIGHT[b.priority] ?? 0;
      if (aPri !== bPri) return bPri - aPri; // higher weight first

      const aOverdue = isOverdue(a.due_date, a.status) ? 1 : 0;
      const bOverdue = isOverdue(b.due_date, b.status) ? 1 : 0;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue; // overdue first

      if (a.due_date && b.due_date) {
        const aDue = new Date(a.due_date).getTime();
        const bDue = new Date(b.due_date).getTime();
        if (aDue !== bDue) return aDue - bDue; // earliest first
      } else if (a.due_date) return -1; // has due_date sorts earlier
      else if (b.due_date) return 1;

      const aCreated = new Date(a.created_at).getTime();
      const bCreated = new Date(b.created_at).getTime();
      return bCreated - aCreated; // newest first
    });
  }, [tasksQ.data, filterMine, filterUrgent, filterOverdue, filterAuto, filterDone, user?.id]);

  async function completeTask(taskId) {
    const notes = window.prompt('Completion notes (optional):');
    if (notes === null) return; // cancelled

    const { error } = await supabase.rpc('complete_task', {
      p_task_id: taskId,
      p_completion_notes: notes || null,
    });

    if (error) {
      toast.error(`Failed to complete: ${error.message}`);
      return;
    }

    toast.success('Task completed!');
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    setOpenDrawer(null);
  }

  const totalCount = tasksQ.data?.length ?? 0;
  const emptyAllTasks = totalCount === 0;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl">
            <span className="text-gradient">Tasks</span>
          </h1>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="btn-primary text-sm"
        >
          + New task
        </button>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'mine', label: 'Mine', state: filterMine, setState: setFilterMine },
          { id: 'urgent', label: 'Urgent 🔥', state: filterUrgent, setState: setFilterUrgent },
          { id: 'overdue', label: 'Overdue', state: filterOverdue, setState: setFilterOverdue },
          { id: 'auto', label: 'Auto-generated', state: filterAuto, setState: setFilterAuto },
          { id: 'done', label: 'Done', state: filterDone, setState: setFilterDone },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => f.setState(!f.state)}
            className={`rounded-full border px-3 py-1 text-xs uppercase tracking-widest transition ${
              f.state
                ? 'border-brandred bg-brandred/10 text-brandred'
                : 'border-darkbg-border text-soft hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {tasksQ.isLoading && <p className="text-soft">Loading tasks…</p>}
      {tasksQ.isError && (
        <div className="card border border-brandred/40 p-4 text-sm text-brandred">
          {tasksQ.error?.message || 'Failed to load tasks'}
        </div>
      )}

      {!tasksQ.isLoading && filtered.length === 0 && (
        <div className="card p-10 text-center">
          <AlertCircle size={36} className="mx-auto mb-3 text-soft/30"/>
          <p className="text-sm text-soft">
            {emptyAllTasks
              ? 'Nothing to do right now. The system will create tasks for you when leads come in or sales close. You can also create your own.'
              : 'No tasks here. Adjust filters or create one.'}
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(task => {
            const overdue = isOverdue(task.due_date, task.status);
            return (
              <button
                key={task.id}
                onClick={() => setOpenDrawer(task)}
                className="card w-full p-4 text-left transition hover:bg-darkbg-900/40"
              >
                <div className="flex items-start gap-3">
                  {/* Priority badge */}
                  <span className={`mt-0.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest whitespace-nowrap flex-shrink-0 ${
                    PRIORITY_COLOR[task.priority] || PRIORITY_COLOR.low
                  }`}>
                    {task.priority}
                  </span>

                  {/* Title */}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white truncate">{task.title}</p>
                    <p className={`text-xs ${overdue ? 'text-brandred' : 'text-soft'}`}>
                      {task.assigned_to_name && `Assigned: ${task.assigned_to_name} · `}
                      {task.due_date
                        ? relativeDate(task.due_date)
                        : 'No due date'}
                    </p>
                    {(task.clients?.business_name || task.auto_generated) && (
                      <p className="mt-0.5 text-xs text-soft">
                        {task.clients?.business_name && `Client: ${task.clients.business_name}`}
                        {task.clients?.business_name && task.auto_generated && ' · '}
                        {task.auto_generated && 'Auto-generated'}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        completeTask(task.id);
                      }}
                      className="rounded-lg border border-darkbg-border px-2 py-1 text-xs text-soft hover:text-white hover:border-emerald-400 transition"
                    >
                      ✓ Complete
                    </button>
                    <div className="relative">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setMenuOpen(menuOpen === task.id ? null : task.id);
                        }}
                        className="rounded-lg border border-darkbg-border px-2 py-1 text-soft hover:text-white transition"
                      >
                        <MoreVertical size={14}/>
                      </button>
                      {menuOpen === task.id && (
                        <TaskMenu
                          task={task}
                          onClose={() => setMenuOpen(null)}
                          onOpenDrawer={() => {
                            setOpenDrawer(task);
                            setMenuOpen(null);
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <TaskDetailDrawer
        task={openDrawer}
        onClose={() => setOpenDrawer(null)}
        onRefresh={() => {
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          // Re-fetch the task to update drawer
          if (openDrawer) {
            const updated = (tasksQ.data ?? []).find(t => t.id === openDrawer.id);
            if (updated) setOpenDrawer(updated);
          }
        }}
      />

      <NewTaskModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={() => {
          setShowNewModal(false);
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
        }}
        currentUserId={user?.id}
        staff={staffQ.data ?? []}
      />
    </div>
  );
}

function TaskMenu({ task, onClose, onOpenDrawer }) {
  const queryClient = useQueryClient();

  async function handleReassign() {
    const newUserId = window.prompt('New assignee user ID (or click drawer menu for picker):');
    if (!newUserId) return;
    const reason = window.prompt('Reason for reassignment:') || null;

    const { error } = await supabase.rpc('reassign_task_to_user', {
      p_task_id: task.id,
      p_new_user_id: newUserId,
      p_reason: reason,
    });

    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }

    toast.success('Task reassigned!');
    onClose();
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  }

  async function handleCancel() {
    const reason = window.prompt('Reason for cancellation (required):');
    if (!reason) {
      toast.error('Reason required');
      return;
    }

    const { error } = await supabase.rpc('cancel_task', {
      p_task_id: task.id,
      p_reason: reason,
    });

    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }

    toast.success('Task cancelled');
    onClose();
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  }

  return (
    <div className="absolute right-0 top-full z-10 mt-1 rounded-lg border border-darkbg-border bg-darkbg-800 shadow-lg min-w-max">
      <button
        onClick={() => {
          onOpenDrawer();
          onClose();
        }}
        className="block w-full px-4 py-2 text-left text-xs text-soft hover:text-white hover:bg-darkbg-700/40 first:rounded-t-lg"
      >
        💬 Comment
      </button>
      <button
        onClick={handleReassign}
        className="block w-full px-4 py-2 text-left text-xs text-soft hover:text-white hover:bg-darkbg-700/40"
      >
        ↪ Reassign
      </button>
      <button
        onClick={handleCancel}
        className="block w-full px-4 py-2 text-left text-xs text-soft hover:text-white hover:bg-darkbg-700/40 last:rounded-b-lg"
      >
        ✕ Cancel
      </button>
    </div>
  );
}
