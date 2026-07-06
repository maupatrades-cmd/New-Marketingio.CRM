import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import MascotGuide from '../../components/MascotGuide.jsx';

export default function ClientReports() {
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">Monthly Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Your performance summary each month.</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-8">
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
    </div>
  );
}
