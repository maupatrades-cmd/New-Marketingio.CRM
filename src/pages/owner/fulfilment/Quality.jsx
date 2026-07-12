import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase.js';

function Stars({ rating }) {
  const r = Math.round(rating || 0);
  return <span className="text-yellow-400">{'★'.repeat(r)}{'☆'.repeat(5 - r)}</span>;
}

function StatCard({ label, value, sub }) {
  return (
    <div className="card p-5 flex flex-col gap-1">
      <span className="text-soft text-xs uppercase tracking-wider">{label}</span>
      <span className="text-3xl font-bold text-white">{value ?? '—'}</span>
      {sub && <span className="text-soft text-xs">{sub}</span>}
    </div>
  );
}

export default function Quality() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['quality-stats'],
    queryFn: () => supabase.rpc('get_quality_stats').then(r => r.data),
  });

  if (isLoading) return <div className="p-8 text-soft">Loading…</div>;
  if (error) return <div className="p-8 text-brandred">Failed to load quality stats.</div>;

  const avgRating = data?.avg_rating;
  const totalFeedback = data?.total_feedback ?? 0;
  const lowRatings = data?.low_ratings ?? 0;
  const byStaff = data?.by_staff ?? [];
  const byProduct = data?.by_product ?? [];
  const recentLow = data?.recent_low ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Quality Dashboard</h1>
        <p className="text-soft text-sm mt-1">Client satisfaction &amp; deliverable feedback</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Avg Rating"
          value={avgRating ? <>{avgRating} ★</> : '—'}
        />
        <StatCard label="Total Feedback" value={totalFeedback} />
        <StatCard
          label="Low Ratings (≤2★)"
          value={<span className={lowRatings > 0 ? 'text-brandred' : 'text-white'}>{lowRatings}</span>}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Staff */}
        <div className="card p-5">
          <h2 className="text-white font-semibold mb-3">By Staff</h2>
          {byStaff.length === 0 ? (
            <p className="text-soft text-sm">No data yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-soft text-xs uppercase border-b border-white/10">
                  <th className="text-left pb-2">Staff</th>
                  <th className="text-left pb-2">Avg Rating</th>
                  <th className="text-right pb-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {byStaff.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-white/5 ${row.avg_rating < 3 ? 'bg-red-900/20' : ''}`}
                  >
                    <td className="py-2 text-white">{row.full_name}</td>
                    <td className="py-2"><Stars rating={row.avg_rating} /> <span className="text-soft ml-1">{row.avg_rating}</span></td>
                    <td className="py-2 text-right text-soft">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* By Product */}
        <div className="card p-5">
          <h2 className="text-white font-semibold mb-3">By Product</h2>
          {byProduct.length === 0 ? (
            <p className="text-soft text-sm">No data yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-soft text-xs uppercase border-b border-white/10">
                  <th className="text-left pb-2">Product</th>
                  <th className="text-left pb-2">Avg Rating</th>
                  <th className="text-right pb-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {byProduct.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-white/5 ${row.avg_rating < 3 ? 'bg-red-900/20' : ''}`}
                  >
                    <td className="py-2 text-white">{row.product}</td>
                    <td className="py-2"><Stars rating={row.avg_rating} /> <span className="text-soft ml-1">{row.avg_rating}</span></td>
                    <td className="py-2 text-right text-soft">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Recent Low Ratings */}
      <div className="card p-5">
        <h2 className="text-white font-semibold mb-3">Recent Low Ratings (≤2★)</h2>
        {recentLow.length === 0 ? (
          <p className="text-soft text-sm">No low ratings — great work!</p>
        ) : (
          <div className="space-y-3">
            {recentLow.map((row, i) => (
              <div key={i} className="flex gap-3 items-start border-b border-white/5 pb-3">
                <span className="text-brandred font-bold text-lg shrink-0">{'★'.repeat(row.rating)}{'☆'.repeat(5 - row.rating)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white text-sm font-medium">{row.title}</span>
                    <span className="text-soft text-xs">· {row.client_name}</span>
                    <span className="text-soft text-xs ml-auto">{new Date(row.created_at).toLocaleDateString()}</span>
                  </div>
                  {row.comment && <p className="text-soft text-xs mt-1 truncate">{row.comment}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
