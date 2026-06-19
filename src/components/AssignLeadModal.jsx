// AssignLeadModal — owner/admin pick a field_agent or cpc to assign a lead to.
// Calls public.assign_lead RPC. RLS + the RPC's role gate enforce who can call it;
// this modal is also rendered only for owner/admin in the parent (defense in depth).
//
// Reassignment UX: when the lead is already assigned, the picker shows the current
// holder inline and the reason field becomes required (locked spec §5.1).

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserCheck, X } from 'lucide-react';
import { supabase } from '../lib/supabase.js';

const ASSIGNABLE_ROLES = ['field_agent', 'cpc'];

export default function AssignLeadModal({ lead, onClose }) {
  const qc = useQueryClient();
  const isReassignment = !!lead.assigned_to;
  const currentAssigneeName = lead.profiles?.full_name ?? null;

  const [selectedId, setSelectedId] = useState('');
  const [reason, setReason]         = useState('');

  // Pull assignable users — joined to profiles for the display name.
  const usersQ = useQuery({
    queryKey: ['assignable-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role, profiles!user_roles_user_id_fkey(full_name)')
        .in('role', ASSIGNABLE_ROLES);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // Dedupe (a user might hold multiple roles) and sort by name.
  const options = useMemo(() => {
    const seen = new Map();
    for (const r of (usersQ.data ?? [])) {
      if (!seen.has(r.user_id)) {
        seen.set(r.user_id, {
          id: r.user_id,
          name: r.profiles?.full_name ?? r.user_id.slice(0, 8),
          roles: [r.role],
        });
      } else {
        seen.get(r.user_id).roles.push(r.role);
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [usersQ.data]);

  const assign = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('assign_lead', {
        p_lead_id:    lead.id,
        p_to_user_id: selectedId,
        p_reason:     reason.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['leads_inbox'] });
      qc.invalidateQueries({ queryKey: ['my-leads'] });
      if (data?.noop) {
        toast.info('Already assigned to this person — no change');
      } else if (data?.was_reassignment) {
        toast.success('Lead reassigned · notification sent');
      } else {
        toast.success('Lead assigned · notification sent');
      }
      onClose();
    },
    onError: (err) => {
      toast.error(err?.message || 'Could not assign lead');
      console.error('[assign_lead]', err);
    },
  });

  const canSubmit =
    !!selectedId
    && !assign.isPending
    && (!isReassignment || reason.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-darkbg-900/80 p-4">
      <div className="card w-full max-w-md p-6">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg flex items-center gap-2">
              <UserCheck size={18} className="text-emerald-300" />
              {isReassignment ? 'Reassign lead' : 'Assign lead'}
            </h2>
            <p className="mt-0.5 text-xs text-soft">{lead.business_name || '—'}</p>
            {isReassignment && (
              <p className="mt-1 text-xs text-amber-300">
                Currently assigned to: {currentAssigneeName || 'someone (name unavailable)'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-soft hover:text-white" aria-label="Close">
            <X size={18}/>
          </button>
        </header>

        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-soft">Assignee</span>
          {usersQ.isLoading ? (
            <p className="text-sm text-soft">Loading users…</p>
          ) : usersQ.error ? (
            <p className="text-sm text-brandred">{usersQ.error.message}</p>
          ) : options.length === 0 ? (
            <p className="text-sm text-soft">No field agents or CPCs available.</p>
          ) : (
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="w-full rounded-md border border-darkbg-border bg-darkbg-900/60 px-3 py-2 text-sm text-white focus:border-brandred focus:outline-none"
            >
              <option value="">Choose a person…</option>
              {options.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name} · {o.roles.join(', ')}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="mt-4 block">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-soft">
            Reason {isReassignment ? '(required for reassignments)' : '(optional)'}
          </span>
          <textarea
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={isReassignment ? 'Why move it?' : 'Optional context for the assignee'}
            className="w-full rounded-md border border-darkbg-border bg-darkbg-900/60 px-3 py-2 text-sm text-white placeholder:text-soft focus:border-brandred focus:outline-none"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-darkbg-border bg-darkbg-900/60 px-3 py-2 text-sm text-soft hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => assign.mutate()}
            disabled={!canSubmit}
            className="rounded-md bg-brandred px-3 py-2 text-sm text-white hover:brightness-110 disabled:opacity-50"
          >
            {assign.isPending ? 'Saving…' : (isReassignment ? 'Reassign' : 'Assign')}
          </button>
        </div>
      </div>
    </div>
  );
}
