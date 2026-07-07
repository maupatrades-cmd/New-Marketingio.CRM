import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download, FileSignature, ExternalLink, CheckCircle2, Clock, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import MascotGuide from '../../components/MascotGuide.jsx';

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

  if (listQ.isLoading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="thinking" size={80} message="Fetching your contracts..." position="inline" />
    </div>
  );
  if (listQ.isError) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="sad" size={80} message={listQ.error?.message || "Something went wrong. Try refreshing."} position="inline" />
    </div>
  );
  const rows = listQ.data ?? [];
  const pendingSign = rows.find(c => c.signing_url && !c.client_signed_at);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">My Contracts</h1>
        <p className="text-sm text-gray-500 mt-1">View and download your signed agreements.</p>
      </div>

      {pendingSign && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-amber-800 flex items-center gap-1">
              📝 You have a contract waiting for your signature
            </h3>
            <p className="text-xs text-amber-700 mt-0.5">Sign it to get your marketing started.</p>
          </div>
          <a href={pendingSign.signing_url} target="_blank" rel="noreferrer"
             className="bg-amber-600 hover:bg-amber-700 text-white rounded-full px-4 py-2 text-xs font-bold transition shrink-0">
            Sign now →
          </a>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="mio-glow-border rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-8">
          <MascotGuide phase="guide" size={80} message="No contracts yet — they'll appear here once your account is set up." position="inline" />
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(c => (
            <li key={c.id} className="mio-glow-border rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-4 hover:border-red-300 hover:shadow-md transition-all duration-200">
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
      <div className="mt-1 flex items-center gap-3 flex-wrap text-xs">
        <span className="text-emerald-600">
          <CheckCircle2 size={12} className="inline mr-1" />
          You signed {new Date(contract.client_signed_at).toLocaleDateString('en-ZA')}
        </span>
        {contract.mio_signed_at ? (
          <span className="text-emerald-600">
            <CheckCircle2 size={12} className="inline mr-1" />
            MiO counter-signed
          </span>
        ) : (
          <span className="text-amber-600">
            <Clock size={12} className="inline mr-1" />
            Awaiting MiO counter-signature
          </span>
        )}
      </div>
    );
  }
  return (
    <p className="text-xs text-amber-600 mt-1">
      <Clock size={12} className="inline mr-1" />
      Awaiting your signature
    </p>
  );
}
