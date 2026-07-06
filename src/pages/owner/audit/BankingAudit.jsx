import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Shield, Eye, X, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase.js';

const VERIFY_TONE = {
  verified: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  unverified: 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
  mismatch: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
};
const fmtDt = (d) => d ? new Date(d).toLocaleString('en-ZA') : '—';

export default function BankingAudit() {
  const [reveal, setReveal] = useState(null); // banking row

  const listQ = useQuery({
    queryKey: ['banking-list'],
    queryFn: async () => { const { data, error } = await supabase.rpc('get_banking_list'); if (error) throw error; return data ?? []; },
  });
  const sumQ = useQuery({
    queryKey: ['banking-summary'],
    queryFn: async () => { const { data, error } = await supabase.rpc('get_banking_summary'); if (error) throw error; return data; },
  });
  const logQ = useQuery({
    queryKey: ['banking-access-log'],
    queryFn: async () => { const { data, error } = await supabase.rpc('get_banking_access_log', { p_limit: 50 }); if (error) throw error; return data ?? []; },
  });

  if (listQ.isLoading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-500" /></div>;
  if (listQ.isError) return <div className="text-red-400 text-sm">{listQ.error?.message}</div>;
  const rows = listQ.data ?? [];
  const accessLog = logQ.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Shield size={22} /> Banking Audit</h1>
        <p className="text-sm text-gray-400 mt-1">POPIA-compliant trail of every banking access.</p>
      </div>

      {sumQ.data && (
        <div className="grid grid-cols-3 gap-3">
          <SumCard label="Banking records" value={sumQ.data.total_records} />
          <SumCard label="Captured this month" value={sumQ.data.captured_this_month} />
          <SumCard label="Last access" value={sumQ.data.last_access ? new Date(sumQ.data.last_access).toLocaleDateString('en-ZA') : 'Never'} small />
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card p-10 text-center">
          <Lock size={32} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400">No banking records captured yet.</p>
          <p className="text-xs text-gray-600 mt-1">Records appear here once clients complete the debit mandate or the Log Sale banking step.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.06] card p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">Client</th><th className="px-4 py-3">Bank</th><th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Holder</th><th className="px-4 py-3">Verification</th><th className="px-4 py-3">Captured by</th><th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white">{r.client_name}</td>
                  <td className="px-4 py-3 text-gray-300">{r.bank_name ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-gray-400">{r.account_masked}</td>
                  <td className="px-4 py-3 text-gray-300">{r.account_holder_name ?? '—'}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${VERIFY_TONE[r.verification_status] ?? VERIFY_TONE.unverified}`}>{r.verification_status ?? 'unverified'}</span></td>
                  <td className="px-4 py-3 text-gray-400">{r.captured_by_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setReveal(r)} className="btn-secondary text-xs"><Eye size={12} /> Reveal</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Access log */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">Access Log</h2>
        {accessLog.length === 0 ? (
          <p className="text-sm text-gray-600">No banking access recorded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {accessLog.map(a => (
              <div key={a.id} className="card p-3 text-sm flex items-center gap-3 flex-wrap">
                <span className="font-mono text-xs text-gray-500">{fmtDt(a.accessed_at)}</span>
                <span className="text-white font-semibold uppercase text-xs">{a.accessed_by_name}</span>
                <span className="text-gray-400">viewed banking for <span className="text-white">{a.client_name}</span></span>
                {a.reason && <span className="text-gray-500 text-xs">— "{a.reason}"</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {reveal && <RevealModal row={reveal} onClose={() => { setReveal(null); logQ.refetch(); }} />}
    </div>
  );
}

function RevealModal({ row, onClose }) {
  const [reason, setReason] = useState('');
  const [revealed, setRevealed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!revealed) return;
    if (countdown <= 0) { setRevealed(null); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [revealed, countdown]);

  const submit = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('reveal_banking', { p_banking_id: row.id, p_reason: reason });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      setRevealed(data.account_number);
      setCountdown(data.auto_mask_seconds ?? 30);
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/[0.08] shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold text-white">Reveal banking</h3>
            <p className="text-sm text-gray-400">{row.client_name}</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-500" /></button>
        </div>
        {revealed ? (
          <div className="text-center py-4">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Account number</p>
            <p className="font-mono text-2xl text-white">{revealed}</p>
            <p className="text-xs text-amber-400 mt-3">Auto-masks in {countdown}s</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-2">Why are you viewing this? <span className="text-red-400">(required for POPIA)</span></p>
            <textarea className="input min-h-[80px]" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Verifying debit day change…" />
            <button onClick={submit} disabled={busy || reason.trim().length < 5}
                    className="mt-3 w-full inline-flex items-center justify-center gap-1 bg-red-500 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Reveal for 30s
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SumCard({ label, value, small }) {
  return (
    <div className="card p-4 text-center">
      <p className={`font-bold text-white ${small ? 'text-sm' : 'text-2xl'}`}>{value ?? 0}</p>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
