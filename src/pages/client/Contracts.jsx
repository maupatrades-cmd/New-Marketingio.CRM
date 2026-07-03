import { useQuery } from '@tanstack/react-query';
import { Loader2, Download, FileSignature, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

const PACKAGE_LABEL = { ignite: 'Ignite', accelerate: 'Accelerate', dominate: 'Dominate', add_on: 'Add-on', custom: 'Custom' };

export default function ClientContracts() {
  const listQ = useQuery({
    queryKey: ['my-contracts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_contracts');
      if (error) throw error;
      return data ?? [];
    },
  });

  if (listQ.isLoading) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-soft" /></div>;
  if (listQ.isError)   return <div className="text-rose-400 text-sm">{listQ.error?.message}</div>;
  const rows = listQ.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-gradient">My Contracts</h1>
        <p className="text-sm text-soft mt-1">View and download your signed agreements.</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-darkbg-border bg-darkbg-800/50 p-8 text-center text-soft">
          No contracts yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(c => (
            <li key={c.id} className="rounded-xl border border-darkbg-border bg-darkbg-800/50 p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                  <FileSignature size={18} className="mt-0.5 text-brandred" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {PACKAGE_LABEL[c.package] ?? c.package ?? 'Contract'}
                    </p>
                    <p className="text-xs text-soft mt-0.5">
                      Created {new Date(c.created_at).toLocaleDateString('en-ZA')}
                    </p>
                    <StatusRow contract={c} />
                  </div>
                </div>
                <div className="flex gap-2">
                  {c.signing_url && !c.client_signed_at && (
                    <a href={c.signing_url} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1 rounded-lg bg-brandred hover:bg-brandred/80 text-white px-3 py-1.5 text-xs font-medium transition">
                      <ExternalLink size={12} /> Sign now
                    </a>
                  )}
                  {c.document_url && (
                    <a href={c.document_url} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1 rounded-lg border border-darkbg-border bg-darkbg-900 hover:border-brandred text-white px-3 py-1.5 text-xs transition">
                      <Download size={12} /> Download
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusRow({ contract }) {
  if (contract.client_signed_at) {
    return (
      <p className="text-xs text-emerald-400 mt-1">
        <CheckCircle2 size={12} className="inline mr-1" />
        Signed {new Date(contract.client_signed_at).toLocaleDateString('en-ZA')}
      </p>
    );
  }
  return (
    <p className="text-xs text-amber-400 mt-1">
      <Clock size={12} className="inline mr-1" />
      Awaiting your signature
    </p>
  );
}
