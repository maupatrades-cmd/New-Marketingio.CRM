import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, ChevronLeft, Download, MessageSquare, CheckCircle2, Clock, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

const TIMELINE = [
  { key: 'in_progress', label: 'In Progress' },
  { key: 'submitted',   label: 'Submitted' },
  { key: 'approved',    label: 'Approved' },
  { key: 'delivered',   label: 'Delivered' },
];

export default function ClientDeliverableDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState('');

  const detailQ = useQuery({
    queryKey: ['my-deliverable', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_deliverable_detail', { p_id: id });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      return data.deliverable;
    },
  });

  const feedbackMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('submit_deliverable_feedback', { p_deliverable_id: id, p_feedback: feedback });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Feedback sent to the team');
      setFeedback('');
      qc.invalidateQueries({ queryKey: ['my-deliverable', id] });
    },
    onError: (err) => toast.error(err.message),
  });

  if (detailQ.isLoading) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-soft" /></div>;
  if (detailQ.isError) return <div className="text-rose-400 text-sm">{detailQ.error?.message}</div>;
  const d = detailQ.data;
  if (!d) return null;

  const currentIdx = TIMELINE.findIndex(t => t.key === d.status);
  const files = Array.isArray(d.file_urls) ? d.file_urls : [];

  return (
    <div className="space-y-6">
      <Link to="/client/deliverables" className="inline-flex items-center gap-1 text-sm text-soft hover:text-white">
        <ChevronLeft size={16} /> Back to deliverables
      </Link>

      <div>
        <h1 className="font-display text-2xl text-white">{d.title}</h1>
        {d.product && <p className="text-sm text-soft mt-1">{d.product}</p>}
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-4">
        <div className="flex items-center justify-between">
          {TIMELINE.map((step, i) => {
            const done = i <= currentIdx || d.status === 'delivered' || d.status === 'approved';
            return (
              <div key={step.key} className="flex-1 flex flex-col items-center">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] ${
                  done ? 'bg-emerald-500 text-white' : 'bg-darkbg-700 text-soft'
                }`}>
                  {done ? <CheckCircle2 size={12} /> : i + 1}
                </div>
                <span className={`mt-1 text-[10px] ${done ? 'text-white' : 'text-soft'}`}>{step.label}</span>
                {i < TIMELINE.length - 1 && (
                  <div className={`hidden ${done ? 'bg-emerald-500' : 'bg-darkbg-700'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      {d.notes && (
        <section className="rounded-xl border border-darkbg-border bg-darkbg-800/50 p-4">
          <p className="text-xs uppercase tracking-widest text-soft mb-2">Notes from the team</p>
          <p className="text-sm text-white whitespace-pre-wrap">{d.notes}</p>
        </section>
      )}

      {/* Files */}
      {files.length > 0 && (
        <section className="rounded-xl border border-darkbg-border bg-darkbg-800/50 p-4">
          <p className="text-xs uppercase tracking-widest text-soft mb-3">Files</p>
          <div className="flex flex-wrap gap-2">
            {files.map((url, i) => {
              const isImg = /\.(jpe?g|png|gif|webp|svg)$/i.test(url);
              return (
                <a key={i} href={url} target="_blank" rel="noreferrer"
                   className="flex items-center gap-2 rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-xs text-white hover:border-brandred transition">
                  {isImg
                    ? <img src={url} alt="" className="h-8 w-8 rounded object-cover" />
                    : <Download size={14} />}
                  File {i + 1}
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* Changes-requested notes */}
      {d.changes_requested_notes && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs uppercase tracking-widest text-amber-300 mb-2">Your last feedback</p>
          <p className="text-sm text-white whitespace-pre-wrap">{d.changes_requested_notes}</p>
        </section>
      )}

      {/* Request changes */}
      {d.status !== 'delivered' && d.status !== 'approved' && (
        <section className="rounded-xl border border-darkbg-border bg-darkbg-800/50 p-4 space-y-3">
          <p className="text-xs uppercase tracking-widest text-soft flex items-center gap-1">
            <MessageSquare size={12} /> Request changes
          </p>
          <textarea className="input min-h-[100px]" value={feedback} onChange={e => setFeedback(e.target.value)}
                    placeholder="Tell the team what you'd like changed…" />
          <button onClick={() => feedbackMut.mutate()} disabled={!feedback.trim() || feedbackMut.isPending}
                  className="inline-flex items-center gap-1 rounded-lg bg-brandred hover:bg-brandred/80 disabled:opacity-50 text-white px-4 py-2 text-sm transition">
            {feedbackMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send feedback
          </button>
        </section>
      )}
    </div>
  );
}
