import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2, ChevronLeft, Download, ExternalLink, CheckCircle2, XCircle, Shield, FileText,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

const PACKAGE_LABEL = { ignite: 'Ignite', accelerate: 'Accelerate', dominate: 'Dominate', add_on: 'Add-on', custom: 'Custom' };

export default function ClientContractDetail() {
  const { id } = useParams();
  const detailQ = useQuery({
    queryKey: ['my-contract', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_contract_detail', { p_id: id });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      return data;
    },
  });

  if (detailQ.isLoading) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;
  if (detailQ.isError) return <div className="text-red-600 text-sm">{detailQ.error?.message}</div>;

  const c = detailQ.data.contract;
  const checks = detailQ.data.checks ?? [];
  const pdfUrl = c.final_signed_pdf_url || c.document_url;
  const passed = checks.filter(x => x.pass).length;

  return (
    <div className="space-y-6">
      <Link to="/client/contracts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#0B2143]">
        <ChevronLeft size={16} /> Back to contracts
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl text-[#0B2143]">{PACKAGE_LABEL[c.package] ?? c.package ?? 'Contract'}</h1>
          {c.add_on_name && <p className="text-sm text-gray-500 mt-0.5">{c.add_on_name} (add-on)</p>}
          <p className="text-xs text-gray-500 mt-1">Created {new Date(c.created_at).toLocaleDateString('en-ZA')}</p>
        </div>
        <div className="flex gap-2">
          {c.signing_url && !c.client_signed_at && (
            <a href={c.signing_url} target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-1 rounded-full bg-red-500 hover:bg-red-600 text-white px-3 py-2 text-xs transition">
              <ExternalLink size={12} /> Sign now
            </a>
          )}
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white hover:border-red-300 text-[#0B2143] px-3 py-2 text-xs transition">
              <Download size={12} /> Download
            </a>
          )}
        </div>
      </div>

      {/* Signature status */}
      <section className="rounded-xl border border-gray-100 bg-white shadow-sm p-4">
        {c.client_signed_at ? (
          <p className="text-sm text-emerald-600"><CheckCircle2 size={14} className="inline mr-1" />
            You signed on {new Date(c.client_signed_at).toLocaleString('en-ZA')}</p>
        ) : (
          <p className="text-sm text-amber-600">Awaiting your signature.</p>
        )}
      </section>

      {/* Verification checklist */}
      <section className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield size={20} className={passed === checks.length ? 'text-emerald-600' : 'text-amber-600'} />
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-[#0B2143] font-medium">{passed} of {checks.length} verified</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${passed === checks.length ? 'bg-emerald-500' : 'bg-amber-500'}`}
                   style={{ width: `${checks.length ? (passed / checks.length) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
        <ul className="space-y-2">
          {checks.map((ch, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              {ch.pass
                ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                : <XCircle size={16} className="text-gray-400 shrink-0" />}
              <span className={ch.pass ? 'text-[#0B2143]' : 'text-gray-500'}>{ch.label}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Special conditions */}
      {c.special_conditions && (
        <section className="rounded-xl border border-gray-100 bg-white shadow-sm p-4">
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Special conditions</p>
          <p className="text-sm text-[#0B2143] whitespace-pre-wrap">{c.special_conditions}</p>
        </section>
      )}

      {/* PDF preview */}
      {pdfUrl && (
        <section className="rounded-xl border border-gray-100 bg-white shadow-sm p-4">
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-1"><FileText size={12} /> Document</p>
          <iframe src={pdfUrl} title="Contract" className="w-full h-[60vh] rounded border border-gray-200" />
        </section>
      )}
    </div>
  );
}
