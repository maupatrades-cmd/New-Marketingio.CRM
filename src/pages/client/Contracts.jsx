import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, Download, FileSignature, ExternalLink, CheckCircle2, Clock, ChevronRight } from 'lucide-react';
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

  if (listQ.isLoading) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;
  if (listQ.isError)   return <div className="text-red-600 text-sm">{listQ.error?.message}</div>;
  const rows = listQ.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">My Contracts</h1>
        <p className="text-sm text-gray-500 mt-1">View and download your signed agreements.</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-8 text-center text-gray-500">
          No contracts yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(c => (
            <li key={c.id} className="rounded-xl border border-gray-100 bg-white shadow-sm p-4 hover:border-red-300 hover:shadow-md transition-all duration-200">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <Link to={`/client/contracts/${c.id}`} className="flex items-start gap-3 flex-1 group">
                  <FileSignature size={18} className="mt-0.5 text-red-500" />
                  <div>
                    <p className="text-sm font-semibold text-[#0B2143] group-hover:text-red-500 transition">
                      {PACKAGE_LABEL[c.package] ?? c.package ?? 'Contract'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Created {new Date(c.created_at).toLocaleDateString('en-ZA')}
                    </p>
                    <StatusRow contract={c} />
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  {c.signing_url && !c.client_signed_at && (
                    <a href={c.signing_url} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1 rounded-full bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 text-xs font-medium transition">
                      <ExternalLink size={12} /> Sign now
                    </a>
                  )}
                  {c.document_url && (
                    <a href={c.document_url} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white hover:border-red-300 text-[#0B2143] px-3 py-1.5 text-xs transition">
                      <Download size={12} /> Download
                    </a>
                  )}
                  <Link to={`/client/contracts/${c.id}`} className="text-gray-500 hover:text-[#0B2143]">
                    <ChevronRight size={16} />
                  </Link>
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
      <p className="text-xs text-emerald-600 mt-1">
        <CheckCircle2 size={12} className="inline mr-1" />
        Signed {new Date(contract.client_signed_at).toLocaleDateString('en-ZA')}
      </p>
    );
  }
  return (
    <p className="text-xs text-amber-600 mt-1">
      <Clock size={12} className="inline mr-1" />
      Awaiting your signature
    </p>
  );
}
