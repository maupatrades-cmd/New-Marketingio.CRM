import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ArrowRight, CheckCircle2, Clock, Send, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase.js';
import MascotGuide from '../../components/MascotGuide.jsx';

export default function ClientReports() {
  const [showRequest, setShowRequest] = useState(false);
  const [request, setRequest] = useState('');
  const [sending, setSending] = useState(false);

  const listQ = useQuery({
    queryKey: ['my-reports'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_reports');
      if (error) throw error;
      return data ?? [];
    },
  });

  if (listQ.isLoading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="thinking" size={80} message="Fetching your reports..." position="inline" />
    </div>
  );
  if (listQ.isError) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="sad" size={80} message={listQ.error?.message || "Something went wrong. Try refreshing."} position="inline" />
    </div>
  );
  const rows = listQ.data ?? [];

  const submitRequest = async () => {
    setSending(true);
    try {
      const { error } = await supabase.rpc('send_client_message', {
        p_subject: 'Report request',
        p_body: request.trim(),
      });
      if (error) throw error;
      toast.success("Request sent — we'll prepare it for you.");
      setShowRequest(false);
      setRequest('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl text-[#0B2143]">Monthly Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Your performance summary each month.</p>
        </div>
        <button
          onClick={() => setShowRequest(true)}
          className="inline-flex items-center gap-1 bg-[#E2293B] hover:bg-red-600 text-white rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition"
        >
          <Send size={13} /> Request a report
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="mio-glow-border rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-8">
          <MascotGuide phase="guide" size={80} message="No reports yet — your first monthly report will appear here." position="inline" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map(r => (
            <Link key={r.id} to={`/client/reports/${r.id}`}
                  className="group rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-4 hover:shadow-md hover:border-red-300 transition-all duration-200">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <BarChart3 size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0B2143]">{r.report_month}</p>
                    {r.package && <span className="inline-block mt-1 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200 px-2 py-0.5 text-[10px] uppercase">{r.package}</span>}
                  </div>
                </div>
                <ArrowRight size={16} className="text-gray-500 group-hover:text-[#0B2143] transition" />
              </div>
              <div className="mt-3 text-[11px] flex items-center gap-1">
                {r.status === 'delivered' ? (
                  <span className="text-emerald-600"><CheckCircle2 size={10} className="inline mr-1" />Delivered {r.delivered_date && new Date(r.delivered_date).toLocaleDateString('en-ZA')}</span>
                ) : (
                  <span className="text-amber-600"><Clock size={10} className="inline mr-1" />Pending</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {showRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => !sending && setShowRequest(false)}
        >
          <div onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-bold text-[#0B2143]">Request a Report</h3>
              <button onClick={() => !sending && setShowRequest(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500">Need a specific report or analysis? Tell us what you need.</p>
            <textarea
              className="input-light mt-3 min-h-[110px]"
              placeholder="e.g. I'd like a comparison of June vs July social media performance"
              value={request}
              onChange={e => setRequest(e.target.value)}
            />
            <button
              onClick={submitRequest}
              disabled={!request.trim() || sending}
              className="mt-3 w-full inline-flex items-center justify-center gap-1 bg-[#E2293B] hover:bg-red-600 disabled:opacity-50 text-white rounded-full py-2.5 text-sm font-semibold transition"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send request
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
