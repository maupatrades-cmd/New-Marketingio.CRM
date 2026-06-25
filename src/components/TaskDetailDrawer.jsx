import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';

const PRIORITY_COLOR = {
  urgent: 'text-brandred',
  high:   'text-orange-300',
  medium: 'text-blue-300',
  low:    'text-soft',
};

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

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TaskDetailDrawer({ task, onClose, onRefresh }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);

  // Refetch the current task in case it updated
  const taskQ = useQuery({
    queryKey: ['task_detail', task?.id],
    enabled: !!task?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, description, priority, status, due_date, assigned_to, assigned_to_name, created_by, client_id, deal_id, auto_generated, source_action, created_at, completed_at, clients:client_id (business_name), deals:deal_id (id, stage)')
        .eq('id', task.id)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 0,
  });

  const commentsQ = useQuery({
    queryKey: ['task_comments', task?.id],
    enabled: !!task?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_comments')
        .select('id, body, comment_type, author_id, author_name, created_at')
        .eq('task_id', task.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 0,
  });

  if (!task) return null;

  const current = taskQ.data || task;
  const overdue = isOverdue(current.due_date, current.status);

  async function postComment() {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      const { error } = await supabase.rpc('comment_on_task', {
        p_task_id: task.id,
        p_body: newComment,
        p_comment_type: 'comment',
      });
      if (error) throw error;
      toast.success('Comment posted');
      setNewComment('');
      queryClient.invalidateQueries({ queryKey: ['task_comments', task.id] });
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setPosting(false);
    }
  }

  async function completeTask() {
    const notes = window.prompt('Completion notes (optional):');
    if (notes === null) return;

    const { error } = await supabase.rpc('complete_task', {
      p_task_id: task.id,
      p_completion_notes: notes || null,
    });
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }

    toast.success('Task completed!');
    onRefresh?.();
    onClose();
  }

  async function reassignTask() {
    const newUserId = window.prompt('New assignee user ID:');
    if (!newUserId) return;
    const reason = window.prompt('Reason (optional):') || null;

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
    onRefresh?.();
  }

  async function cancelTask() {
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
    onRefresh?.();
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition ${task ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-[480px] bg-darkbg-800 border-l border-darkbg-border overflow-y-auto transition transform ${
          task ? 'translate-x-0' : 'translate-x-full'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {taskQ.isLoading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin text-soft" size={24}/>
          </div>
        )}

        {!taskQ.isLoading && (
          <>
            {/* Header */}
            <div className="sticky top-0 bg-darkbg-800 border-b border-darkbg-border p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-lg text-white truncate">{current.title}</h2>
              </div>
              <button onClick={onClose} className="shrink-0 text-soft hover:text-white transition">
                <X size={20}/>
              </button>
            </div>

            <div className="p-4 space-y-5">
              {/* Priority + due date + status */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`uppercase tracking-wider font-semibold ${PRIORITY_COLOR[current.priority] || 'text-soft'}`}>
                    🔥 {current.priority}
                  </span>
                  {current.due_date && (
                    <span className={overdue ? 'text-brandred' : 'text-soft'}>
                      {relativeDate(current.due_date)}
                    </span>
                  )}
                </div>
              </div>

              {/* Assignment + client + source */}
              <div className="space-y-1 text-sm text-soft border-t border-darkbg-border pt-3">
                {current.assigned_to_name && (
                  <p>Assigned to: <span className="text-white font-medium">{current.assigned_to_name}</span></p>
                )}
                {current.clients?.business_name && (
                  <p>Client: <span className="text-white font-medium">{current.clients.business_name}</span></p>
                )}
                {current.source_action && (
                  <p>Source: <span className="text-white font-mono text-xs">{current.source_action}</span></p>
                )}
                {current.auto_generated && (
                  <p className="text-blue-300">🤖 Auto-generated</p>
                )}
              </div>

              {/* Description */}
              {current.description && (
                <div className="border-t border-darkbg-border pt-3 space-y-1">
                  <p className="text-xs uppercase tracking-widest text-soft font-semibold">Description</p>
                  <p className="text-sm text-white leading-relaxed">{current.description}</p>
                </div>
              )}

              {/* Comments */}
              <div className="border-t border-darkbg-border pt-3 space-y-3">
                <p className="text-xs uppercase tracking-widest text-soft font-semibold">Comments</p>
                {commentsQ.isLoading && (
                  <p className="text-xs text-soft">Loading…</p>
                )}
                {(commentsQ.data ?? []).length === 0 && !commentsQ.isLoading && (
                  <p className="text-xs text-soft">No comments yet.</p>
                )}
                <div className="space-y-2">
                  {(commentsQ.data ?? []).map(comment => (
                    <div key={comment.id} className="rounded-lg border border-darkbg-border bg-darkbg-900/40 p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs font-medium text-white">{comment.author_name}</p>
                        <p className="text-[10px] text-soft">{fmt(comment.created_at)}</p>
                      </div>
                      <p className="text-sm text-soft">{comment.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Comment input */}
              <div className="border-t border-darkbg-border pt-3 space-y-2">
                <textarea
                  placeholder="Add a comment…"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  className="input text-sm w-full min-h-[70px]"
                />
                <button
                  onClick={postComment}
                  disabled={!newComment.trim() || posting}
                  className="btn-primary text-sm w-full disabled:opacity-50"
                >
                  {posting ? <Loader2 className="inline animate-spin" size={14}/> : 'Post'}
                </button>
              </div>

              {/* Action buttons */}
              <div className="border-t border-darkbg-border pt-3 flex gap-2 flex-wrap">
                {current.status !== 'done' && (
                  <button
                    onClick={completeTask}
                    className="btn-primary text-xs flex-1"
                  >
                    ✓ Complete
                  </button>
                )}
                <button
                  onClick={reassignTask}
                  className="btn-ghost text-xs flex-1"
                >
                  ↪ Reassign
                </button>
                {current.status !== 'cancelled' && (
                  <button
                    onClick={cancelTask}
                    className="btn-ghost text-xs flex-1 text-brandred hover:bg-brandred/10"
                  >
                    ✕ Cancel
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
