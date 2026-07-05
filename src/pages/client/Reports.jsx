import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, BarChart3, ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

export default function ClientReports() {
  const listQ = useQuery({
    queryKey: ['my-reports'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_reports');
      if (error) throw error;
      return data ?? [];
    },
  });

  if (listQ.isLoading) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-soft" /></div>;
  if (listQ.isError) return <div className="text-rose-400 text-sm">{listQ.error?.message}</div>;
  const rows = listQ.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-gradient">Monthly Reports</h1>
        <p className="text-sm text-soft mt-1">Your performance summary each month.</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-darkbg-border bg-darkbg-800/50 p-8 text-center text-soft">
          No reports yet — your first monthly report will appear here.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map(r => (
            <Link key={r.id} to={`/client/reports/${r.id}`}
                  className="group rounded-xl border border-darkbg-border bg-darkbg-800/50 p-4 hover:border-brandred transition">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <BarChart3 size={18} className="text-blue-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{r.report_month}</p>
                    {r.package && <span className="inline-block mt-1 rounded-full border border-blue-400/40 bg-blue-400/10 px-2 py-0.5 text-[10px] text-blue-300 uppercase">{r.package}</span>}
                  </div>
                </div>
                <ArrowRight size={16} className="text-soft group-hover:text-white transition" />
              </div>
              <div className="mt-3 text-[11px] flex items-center gap-1">
                {r.status === 'delivered' ? (
                  <span className="text-emerald-400"><CheckCircle2 size={10} className="inline mr-1" />Delivered {r.delivered_date && new Date(r.delivered_date).toLocaleDateString('en-ZA')}</span>
                ) : (
                  <span className="text-amber-400"><Clock size={10} className="inline mr-1" />Pending</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
