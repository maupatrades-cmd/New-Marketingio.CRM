import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ChevronLeft, Download, BarChart3 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

export default function ClientReportDetail() {
  const { id } = useParams();
  const listQ = useQuery({
    queryKey: ['my-reports'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_reports');
      if (error) throw error;
      return data ?? [];
    },
  });

  if (listQ.isLoading) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;
  const r = (listQ.data ?? []).find(x => x.id === id);
  if (!r) return <div className="text-gray-500 text-sm">Report not found.</div>;

  return (
    <div className="space-y-6">
      <Link to="/client/reports" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#0B2143]">
        <ChevronLeft size={16} /> Back to reports
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-[#0B2143]">{r.report_month}</h1>
          {r.package && <span className="inline-block mt-1 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200 px-2 py-0.5 text-xs uppercase">{r.package}</span>}
        </div>
        {r.report_url && (
          <a href={r.report_url} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1 rounded-full bg-red-500 hover:bg-red-600 text-white px-3 py-2 text-xs transition">
            <Download size={12} /> Download report
          </a>
        )}
      </div>

      {r.social_posts_published != null && (
        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6">
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Posts Published</p>
          <p className="text-3xl font-display text-[#0B2143]">{r.social_posts_published}</p>
        </section>
      )}

      {r.engagement_summary && (
        <Section title="Engagement summary" body={r.engagement_summary} />
      )}
      {r.top_performing_content && (
        <Section title="Top performing content" body={r.top_performing_content} />
      )}
      {r.recommendations && (
        <Section title="Recommendations from the team" body={r.recommendations} />
      )}

      {!r.social_posts_published && !r.engagement_summary && !r.report_url && (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-8 text-center text-gray-500">
          <BarChart3 size={32} className="mx-auto text-gray-400 mb-2" />
          Report is still being prepared. Check back soon.
        </div>
      )}
    </div>
  );
}

function Section({ title, body }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6">
      <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">{title}</p>
      <p className="text-sm text-[#0B2143] whitespace-pre-wrap">{body}</p>
    </section>
  );
}
