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

  if (listQ.isLoading) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;
  if (listQ.isError) return <div className="text-red-600 text-sm">{listQ.error?.message}</div>;
  const rows = listQ.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">Monthly Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Your performance summary each month.</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-8 text-center text-gray-500">
          No reports yet — your first monthly report will appear here.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map(r => (
            <Link key={r.id} to={`/client/reports/${r.id}`}
                  className="group rounded-xl border border-gray-100 bg-white shadow-sm p-4 hover:shadow-md hover:border-red-300 transition-all duration-200">
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
    </div>
  );
}
