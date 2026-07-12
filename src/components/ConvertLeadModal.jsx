import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Zap, GitBranch, X as XIcon } from 'lucide-react';
import { supabase } from '../lib/supabase.js';

export function useConvertLead(onDone) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async ({ leadId, quickClose }) => {
      const { data, error } = await supabase.rpc('convert_lead_to_deal', {
        p_lead_id: leadId,
        p_quick_close: quickClose,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['leads_inbox'] });
      qc.invalidateQueries({ queryKey: ['pipeline_deals'] });
      qc.invalidateQueries({ queryKey: ['owner_dashboard'] });
      onDone?.();
      if (data?.next_step === 'open_log_sale_wizard') {
        toast.success('Deal created — opening Log Sale…');
        navigate(`/owner/sales/log?deal=${data.deal_id}&lead=${data.lead_id}`);
      } else {
        toast.success('Deal created — added to pipeline');
        navigate(`/owner/sales/leads?deal=${data.deal_id}`);
      }
    },
    onError: (err) => {
      const msg = err?.message || '';
      if (msg.includes('lead_already_converted')) {
        const m = msg.match(/existing_deal=([0-9a-f-]+)/i);
        toast.error(m ? `Already converted — deal ${m[1].slice(0,8)}… exists` : 'Already converted');
      } else if (msg.includes('lead_must_be_verified_first')) {
        toast.error('Verify this lead before converting it to a deal');
      } else {
        toast.error(msg || 'Convert failed');
      }
      console.error('[convert]', err);
    },
  });
}

export default function ConvertLeadModal({ lead, busy, onPipeline, onQuickClose, onClose }) {
  if (!lead) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-darkbg-900/80 p-4">
      <div className="card w-full max-w-md p-6 space-y-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-lg text-white">Convert to deal</h2>
            <p className="text-sm text-soft mt-0.5">{lead.business_name || lead.client_name}</p>
          </div>
          <button onClick={onClose} className="text-soft hover:text-white mt-0.5">
            <XIcon size={18}/>
          </button>
        </div>
        <p className="text-sm text-soft">How are you closing this lead?</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onQuickClose} disabled={busy}
            className="flex flex-col items-center gap-3 rounded-lg border border-darkbg-border bg-darkbg-900/60 p-4 text-center hover:border-brandred/40 hover:bg-brandred/5 transition disabled:opacity-50">
            <Zap size={22} className="text-brandred"/>
            <div>
              <p className="font-semibold text-white text-sm">Quick close</p>
              <p className="text-[11px] text-soft mt-0.5">Skip stages · jump to Log Sale wizard</p>
            </div>
          </button>
          <button onClick={onPipeline} disabled={busy}
            className="flex flex-col items-center gap-3 rounded-lg border border-darkbg-border bg-darkbg-900/60 p-4 text-center hover:border-orange-500/40 hover:bg-orange-500/5 transition disabled:opacity-50">
            <GitBranch size={22} className="text-orange-400"/>
            <div>
              <p className="font-semibold text-white text-sm">Add to pipeline</p>
              <p className="text-[11px] text-soft mt-0.5">Starts at Contacted · work through stages</p>
            </div>
          </button>
        </div>
        {busy && <p className="text-center text-sm text-soft">Creating deal…</p>}
      </div>
    </div>
  );
}
