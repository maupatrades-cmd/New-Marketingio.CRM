import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase.js';
import Modal from './Modal.jsx';

export default function NewTaskModal({ open, onClose, onCreated, currentUserId, staff }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [assigneeId, setAssigneeId] = useState(currentUserId || '');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.rpc('create_task', {
        p_title: title,
        p_description: description || null,
        p_priority: priority,
        p_due_date: dueDate || null,
        p_assignee_id: assigneeId || null,
      });

      if (error) throw error;

      toast.success(`Task created: ${title}`);
      setTitle('');
      setDescription('');
      setPriority('medium');
      setDueDate('');
      setAssigneeId(currentUserId || '');
      onCreated?.();
      onClose?.();
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <>
      <button onClick={onClose} className="btn-ghost">
        Cancel
      </button>
      <button onClick={handleSubmit} disabled={busy} className="btn-primary disabled:opacity-50">
        {busy ? 'Creating…' : 'Create'}
      </button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title="New Task" footer={footer}>
      <div className="space-y-3">
        <div>
          <label className="label">Title *</label>
          <input
            type="text"
            placeholder="e.g. Chase setup fee payment"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="input"
            autoFocus
          />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            placeholder="Additional context…"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="input min-h-[70px]"
          />
        </div>

        <div>
          <label className="label">Priority</label>
          <div className="flex gap-2">
            {['low', 'medium', 'high', 'urgent'].map(p => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs uppercase tracking-widest transition ${
                  priority === p
                    ? 'border-brandred bg-brandred/10 text-brandred'
                    : 'border-darkbg-border text-soft hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="label">Assign to</label>
          <select
            value={assigneeId}
            onChange={e => setAssigneeId(e.target.value)}
            className="input"
          >
            <option value="">— Unassigned —</option>
            {staff.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}
