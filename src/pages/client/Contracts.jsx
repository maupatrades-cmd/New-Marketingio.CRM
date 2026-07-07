import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download, ExternalLink, CheckCircle2, Clock, Circle, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import MascotGuide from '../../components/MascotGuide.jsx';

const PACKAGE_LABEL = { ignite: 'Ignite', accelerate: 'Accelerate', dominate: 'Dominate', add_on: 'Add-on', custom: 'Custom' };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

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
  const outstanding = rows.filter(c => c.signing_url && !c.client_signed_at);
  const signed      = rows.filter(c => c.client_signed_at);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">My Contracts</h1>
        <p className="text-sm text-gray-500 mt-1">View and download your signed agreements.</p>
      </div>

      {/* Outstanding — needs the client's signature */}
      {outstanding.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[#0B2143] uppercase tracking-widest">Outstanding</h2>
          {outstanding.map(c => (
            <div key={c.id} className="mio-glow-border rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h3 className="font-semibold text-amber-800">
                    📝 {PACKAGE_LABEL[c.package] ?? c.package ?? 'Contract'} Agreement
                  </h3>
                  {c.add_on_name && (
                    <p className="text-xs text-amber-700 mt-1">Add-on: {c.add_on_name}</p>
                  )}
                  <p className="text-xs text-amber-700 mt-0.5">Created {fmtDate(c.created_at)}</p>
                </div>
                <a href={c.signing_url} target="_blank" rel="noreferrer"
                   className="bg-[#E2293B] hover:bg-red-600 text-white rounded-full px-5 py-2.5 text-sm font-bold transition shrink-0">
                  Review &amp; Sign →
                </a>
              </div>
            </div>
          ))}
        </section>
      )}

      {rows.length === 0 && (
        <div className="mio-glow-border rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-8">
          <MascotGuide phase="guide" size={80} message="No contracts yet — they'll appear here once your account is set up." position="inline" />
        </div>
      )}

      {/* Signed — with verification scanner */}
      {signed.length > 0 && (
        <section className="space-y-3">
          {outstanding.length > 0 && (
            <h2 className="text-sm font-semibold text-[#0B2143] uppercase tracking-widest">Signed</h2>
          )}
          {signed.map(c => (
            <div key={c.id} className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <Link to={`/client/contracts/${c.id}`} className="flex-1 min-w-0 group">
                  <h3 className="font-semibold text-[#0B2143] group-hover:text-red-500 transition">
                    {PACKAGE_LABEL[c.package] ?? c.package ?? 'Contract'} Agreement
                  </h3>
                  {c.add_on_name && <p className="text-xs text-gray-500 mt-0.5">Add-on: {c.add_on_name}</p>}
                  <p className="text-xs text-emerald-600 mt-0.5">
                    <CheckCircle2 size={12} className="inline mr-1" />
                    You signed {fmtDate(c.client_signed_at)}
                  </p>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
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

              {/* Verification scanner */}
              <div className="pt-3 border-t border-gray-100">
                <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Verification</p>
                <div className="space-y-1.5">
                  <CheckRow done={!!c.document_url}
                    label="Contract document generated" />
                  <CheckRow done={!!c.client_signed_at}
                    label={`Your signature · ${c.client_signed_at ? fmtDate(c.client_signed_at) : 'Pending'}`} />
                  <CheckRow done={!!c.mio_signed_at}
                    label={`Marketing iO counter-signature · ${c.mio_signed_at ? fmtDate(c.mio_signed_at) : 'Pending'}`} />
                  <CheckRow done={!!c.popia_signed} label="POPIA consent acknowledged" />
                  <CheckRow done={!!c.id_verified} label="Identity verified" />
                  <CheckRow done={!!c.banking_captured} label="Banking details captured" />
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function CheckRow({ done, label }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done
        ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
        : <Circle size={14} className="text-gray-300 shrink-0" />}
      <span className={done ? 'text-[#0B2143]' : 'text-gray-400'}>{label}</span>
    </div>
  );
}
