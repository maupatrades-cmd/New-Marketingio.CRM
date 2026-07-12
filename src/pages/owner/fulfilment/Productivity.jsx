import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase.js';

function StatCard({ label, value }) {
  return (
    <div className="card p-5 flex flex-col gap-1">
      <span className="text-soft text-xs uppercase tracking-wider">{label}</span>
      <span className="text-3xl font-bold text-white">{value ?? '—'}</span>
    </div>
  );
}

export default function Productivity() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['productivity-stats'],
    queryFn: () => supabase.rpc('get_productivity_stats').then(r => r.data),
  });

  if (isLoading) return <div className="p-8 text-soft">Loading…</div>;
  if (error) return <div className="p-8 text-brandred">Failed to load productivity stats.</div>;

  const totalHours = data?.total_hours ?? 0;
  const monthHours = data?.this_month_hours ?? 0;
  const byStaff = data?.by_staff ?? [];
  const byClient = data?.by_client ?? [];
  const overruns = data?.overruns ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Productivity Dashboard</h1>
        <p className="text-soft text-sm mt-1">Time tracking &amp; efficiency</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Total Hours (All Time)" value={`${totalHours}h`} />
        <StatCard label="This Month" value={`${monthHours}h`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Staff */}
        <div className="card p-5">
          <h2 className="text-white font-semibold mb-3">By Staff</h2>
          {byStaff.length === 0 ? (
            <p className="text-soft text-sm">No time logs yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-soft text-xs uppercase border-b border-white/10">
                  <th className="text-left pb-2">Staff</th>
                  <th className="text-right pb-2">Hours</th>
                  <th className="text-right pb-2">Deliverables</th>
                </tr>
              </thead>
              <tbody>
                {byStaff.map((row, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-2 text-white">{row.full_name}</td>
                    <td className="py-2 text-right text-soft">{row.hours}h</td>
                    <td className="py-2 text-right text-soft">{row.deliverables}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* By Client */}
        <div className="card p-5">
          <h2 className="text-white font-semibold mb-3">By Client</h2>
          {byClient.length === 0 ? (
            <p className="text-soft text-sm">No time logs yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-soft text-xs uppercase border-b border-white/10">
                  <th className="text-left pb-2">Client</th>
                  <th className="text-right pb-2">Hours</th>
                </tr>
              </thead>
              <tbody>
                {byClient.map((row, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-2 text-white">{row.client_name}</td>
                    <td className="py-2 text-right text-soft">{row.hours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Overruns */}
      <div className="card p-5 border border-brandred/40">
        <h2 className="text-brandred font-semibold mb-3">Time Overruns</h2>
        {overruns.length === 0 ? (
          <p className="text-soft text-sm">No overruns detected.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-soft text-xs uppercase border-b border-white/10">
                <th className="text-left pb-2">Deliverable</th>
                <th className="text-left pb-2">Client</th>
                <th className="text-left pb-2">Product</th>
                <th className="text-right pb-2">Logged</th>
                <th className="text-right pb-2">Expected</th>
              </tr>
            </thead>
            <tbody>
              {overruns.map((row, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="py-2 text-white max-w-[180px] truncate">{row.title}</td>
                  <td className="py-2 text-soft">{row.client_name}</td>
                  <td className="py-2 text-soft">{row.product}</td>
                  <td className="py-2 text-right text-brandred font-medium">{row.hours_logged}h</td>
                  <td className="py-2 text-right text-soft">{row.expected_hours}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
